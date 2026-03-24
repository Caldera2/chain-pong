// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ChainPongStaking
 * @author Chain Pong Team
 * @notice Trustless escrow for PvP pong matches on Base.
 *         Both players lock ETH → winner gets the pot → protocol takes a fee.
 *
 * @dev Architecture decisions:
 *      - Reentrancy guard via manual lock (cheaper than OZ's modifier on Base).
 *      - No ERC-20 support — ETH-only keeps the contract simple and gas-efficient.
 *      - Match IDs are server-generated UUIDs stored as bytes32.
 *      - Only the authorized backend (resolver) can settle matches.
 *      - Emergency withdrawal by owner after configurable timeout.
 */
contract ChainPongStaking {

    // ══════════════════════════════════════════════════════
    // TYPES
    // ══════════════════════════════════════════════════════

    enum MatchState {
        Empty,        // 0 — slot unused
        WaitingP2,    // 1 — player1 staked, waiting for player2
        Active,       // 2 — both staked, game in progress
        Settled,      // 3 — winner paid out
        Cancelled,    // 4 — refunded
        Disputed      // 5 — flagged for admin review
    }

    struct Match {
        bytes32       id;
        address       player1;
        address       player2;
        uint256       stakeAmount;      // per-player stake
        MatchState    state;
        address       winner;
        uint256       createdAt;
        uint256       settledAt;
    }

    // ══════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════

    address public owner;
    address public resolver;            // backend address authorized to settle
    uint256 public protocolFeeBps;      // basis points (250 = 2.5%)
    uint256 public minStake;
    uint256 public maxStake;
    uint256 public disputeTimeout;      // seconds before owner can force-settle
    bool    public paused;

    uint256 public totalMatches;
    uint256 public totalVolume;
    uint256 public protocolEarnings;

    mapping(bytes32 => Match) public matches;
    mapping(address => uint256) public playerMatchCount;
    mapping(address => uint256) public playerTotalWinnings;

    // Valid stake amounts (mirrors frontend STAKE_TIERS)
    mapping(uint256 => bool) public validStakes;

    bool private _locked;

    // ══════════════════════════════════════════════════════
    // EVENTS
    // ══════════════════════════════════════════════════════

    event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 stakeAmount);
    event MatchJoined(bytes32 indexed matchId, address indexed player2);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event MatchCancelled(bytes32 indexed matchId, address indexed player);
    event MatchDisputed(bytes32 indexed matchId);
    event StakeTierUpdated(uint256 amount, bool enabled);
    event ResolverUpdated(address indexed newResolver);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    // ══════════════════════════════════════════════════════
    // MODIFIERS
    // ══════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver, "Not resolver");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrancy");
        _locked = true;
        _;
        _locked = false;
    }

    // ══════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ══════════════════════════════════════════════════════

    constructor(address _resolver, uint256 _feeBps) {
        require(_resolver != address(0), "Invalid resolver");
        require(_feeBps <= 1000, "Fee too high"); // max 10%

        owner = msg.sender;
        resolver = _resolver;
        protocolFeeBps = _feeBps;
        minStake = 0.001 ether;
        maxStake = 0.05 ether;
        disputeTimeout = 24 hours;

        // Initialize valid stake tiers
        validStakes[0.001 ether] = true;
        validStakes[0.002 ether] = true;
        validStakes[0.005 ether] = true;
        validStakes[0.01 ether]  = true;
        validStakes[0.02 ether]  = true;
        validStakes[0.05 ether]  = true;
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS
    // ══════════════════════════════════════════════════════

    /**
     * @notice Create a match and stake ETH. Generates a match slot waiting for player 2.
     * @param matchId Server-generated unique match identifier (bytes32).
     */
    function createMatch(bytes32 matchId) external payable whenNotPaused nonReentrant {
        require(matches[matchId].state == MatchState.Empty, "Match ID exists");
        require(validStakes[msg.value], "Invalid stake amount");

        matches[matchId] = Match({
            id: matchId,
            player1: msg.sender,
            player2: address(0),
            stakeAmount: msg.value,
            state: MatchState.WaitingP2,
            winner: address(0),
            createdAt: block.timestamp,
            settledAt: 0
        });

        playerMatchCount[msg.sender]++;
        totalMatches++;
        totalVolume += msg.value;

        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    /**
     * @notice Join an existing match by staking the same amount.
     * @param matchId The match to join.
     */
    function joinMatch(bytes32 matchId) external payable whenNotPaused nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.WaitingP2, "Not joinable");
        require(msg.sender != m.player1, "Can't play yourself");
        require(msg.value == m.stakeAmount, "Stake mismatch");

        m.player2 = msg.sender;
        m.state = MatchState.Active;

        playerMatchCount[msg.sender]++;
        totalVolume += msg.value;

        emit MatchJoined(matchId, msg.sender);
    }

    /**
     * @notice Cancel a match before an opponent joins. Refunds your stake.
     * @param matchId The match to cancel.
     */
    function cancelMatch(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        require(m.player1 == msg.sender, "Not your match");
        require(m.state == MatchState.WaitingP2, "Can't cancel");

        m.state = MatchState.Cancelled;

        (bool sent, ) = payable(msg.sender).call{value: m.stakeAmount}("");
        require(sent, "Refund failed");

        emit MatchCancelled(matchId, msg.sender);
    }

    // ══════════════════════════════════════════════════════
    // RESOLVER ACTIONS (backend server)
    // ══════════════════════════════════════════════════════

    /**
     * @notice Settle a match — transfer pot to winner, protocol takes fee.
     * @param matchId The match to settle.
     * @param _winner Address of the winning player (must be player1 or player2).
     */
    function settleMatch(bytes32 matchId, address _winner) external onlyResolver nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        require(_winner == m.player1 || _winner == m.player2, "Invalid winner");

        m.winner = _winner;
        m.state = MatchState.Settled;
        m.settledAt = block.timestamp;

        uint256 pot = m.stakeAmount * 2;
        uint256 fee = (pot * protocolFeeBps) / 10000;
        uint256 payout = pot - fee;

        protocolEarnings += fee;
        playerTotalWinnings[_winner] += payout;

        (bool sent, ) = payable(_winner).call{value: payout}("");
        require(sent, "Payout failed");

        emit MatchSettled(matchId, _winner, payout, fee);
    }

    /**
     * @notice Flag a match as disputed for admin review.
     */
    function disputeMatch(bytes32 matchId) external onlyResolver {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        m.state = MatchState.Disputed;
        emit MatchDisputed(matchId);
    }

    /**
     * @notice Resolve a disputed match — owner decides the winner or refunds both.
     * @param matchId The disputed match.
     * @param _winner Winner address, or address(0) to refund both.
     */
    function resolveDispute(bytes32 matchId, address _winner) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Disputed, "Not disputed");

        if (_winner == address(0)) {
            // Refund both players
            m.state = MatchState.Cancelled;
            (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
            (bool s2, ) = payable(m.player2).call{value: m.stakeAmount}("");
            require(s1 && s2, "Refund failed");
            emit MatchCancelled(matchId, address(0));
        } else {
            require(_winner == m.player1 || _winner == m.player2, "Invalid winner");
            m.winner = _winner;
            m.state = MatchState.Settled;
            m.settledAt = block.timestamp;

            uint256 pot = m.stakeAmount * 2;
            uint256 fee = (pot * protocolFeeBps) / 10000;
            uint256 payout = pot - fee;
            protocolEarnings += fee;
            playerTotalWinnings[_winner] += payout;

            (bool sent, ) = payable(_winner).call{value: payout}("");
            require(sent, "Payout failed");
            emit MatchSettled(matchId, _winner, payout, fee);
        }
    }

    // ══════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ══════════════════════════════════════════════════════

    function setResolver(address _resolver) external onlyOwner {
        require(_resolver != address(0), "Invalid address");
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high");
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(_feeBps);
    }

    function setStakeTier(uint256 amount, bool enabled) external onlyOwner {
        validStakes[amount] = enabled;
        emit StakeTierUpdated(amount, enabled);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function setDisputeTimeout(uint256 _timeout) external onlyOwner {
        disputeTimeout = _timeout;
    }

    /**
     * @notice Withdraw accumulated protocol fees.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = protocolEarnings;
        require(amount > 0, "No fees");
        protocolEarnings = 0;
        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdraw failed");
    }

    /**
     * @notice Emergency: force-cancel a stuck match after timeout.
     */
    function emergencyCancel(bytes32 matchId) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        require(
            m.state == MatchState.Active || m.state == MatchState.Disputed,
            "Not eligible"
        );
        require(
            block.timestamp > m.createdAt + disputeTimeout,
            "Timeout not reached"
        );

        m.state = MatchState.Cancelled;
        (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
        (bool s2, ) = payable(m.player2).call{value: m.stakeAmount}("");
        require(s1 && s2, "Refund failed");
        emit MatchCancelled(matchId, address(0));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ══════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════

    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isValidStake(uint256 amount) external view returns (bool) {
        return validStakes[amount];
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
