// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ChainPongEscrow
 * @author Chain Pong Team
 * @notice Trustless escrow for PvP pong matches + perk shop on Base.
 *
 * ALL money lives in this contract. There is NO treasury wallet.
 *
 * Architecture:
 * - Pull-over-push: Winners claim earnings manually. Dev fees accumulate
 *   and are withdrawn in batches.
 * - Check-Effects-Interactions: State updated before external calls.
 * - Manual reentrancy guard (cheaper than OZ on L2).
 * - Only authorized resolver (backend) can settle matches.
 * - ETH-only, no ERC-20 support.
 *
 * Money flow:
 *   Player stakes ETH ──→ Contract holds it
 *   Match settled     ──→ Winner's claimable balance increases (no ETH moves)
 *                     ──→ 4% fee added to totalDeveloperEarnings
 *   Winner claims     ──→ Contract sends ETH to winner
 *   Dev withdraws     ──→ Contract sends accumulated fees to revenueWallet
 *   Perk purchase     ──→ 100% to totalDeveloperEarnings (stays in contract)
 */
contract ChainPongEscrow {

    // ══════════════════════════════════════════════════════
    // TYPES
    // ══════════════════════════════════════════════════════

    enum MatchState {
        Empty,        // 0 — slot unused
        WaitingP2,    // 1 — player1 staked, waiting for player2
        Active,       // 2 — both staked, game in progress
        Settled,      // 3 — winner determined, earnings credited
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

    struct Perk {
        uint256 price;
        bool    active;
        uint256 totalSold;
    }

    // ══════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════

    address public owner;
    address public resolver;            // backend address authorized to settle
    address public revenueWallet;       // where withdrawEarnings() sends fees
    uint256 public protocolFeeBps;      // basis points (400 = 4%)
    uint256 public minStake;
    uint256 public maxStake;
    uint256 public disputeTimeout;      // seconds before owner can force-settle
    bool    public paused;

    // ── Accounting ───────────────────────────────────────
    uint256 public totalMatches;
    uint256 public totalVolume;
    uint256 public totalDeveloperEarnings;   // Accumulated: match fees + perk sales
    uint256 public totalPerkRevenue;         // Subset: earnings from perk sales only
    uint256 public totalWithdrawn;           // Running total of dev withdrawals
    uint256 public totalPlayerClaimed;       // Running total of player claims

    // ── Player Balances (claim-based) ───────────────────
    mapping(address => uint256)   public claimableBalance;      // unclaimed winnings
    mapping(address => uint256)   public playerTotalWinnings;   // lifetime stat
    mapping(address => uint256)   public playerTotalClaimed;    // lifetime claimed

    // ── Mappings ─────────────────────────────────────────
    mapping(bytes32 => Match)     public matches;
    mapping(address => uint256)   public playerMatchCount;
    mapping(uint256 => bool)      public validStakes;

    // ── Perk Shop ────────────────────────────────────────
    uint256 public perkCount;
    mapping(uint256 => Perk)                public perks;
    mapping(address => mapping(uint256 => bool)) public playerPerks;

    bool private _locked;

    // ══════════════════════════════════════════════════════
    // EVENTS
    // ══════════════════════════════════════════════════════

    event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 stakeAmount);
    event MatchJoined(bytes32 indexed matchId, address indexed player2);
    event MatchReady(bytes32 indexed matchId, address player1, address player2, uint256 stakeAmount);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event MatchCancelled(bytes32 indexed matchId, address indexed player);
    event MatchDisputed(bytes32 indexed matchId);

    event WinningsClaimed(address indexed player, uint256 amount);
    event PerkCreated(uint256 indexed perkId, uint256 price);
    event PerkPurchased(uint256 indexed perkId, address indexed buyer, uint256 price);
    event PerkUpdated(uint256 indexed perkId, uint256 price, bool active);

    event EarningsWithdrawn(address indexed to, uint256 amount);
    event RevenueWalletUpdated(address indexed newWallet);
    event StakeTierUpdated(uint256 amount, bool enabled);
    event ResolverUpdated(address indexed newResolver);
    event ProtocolFeeUpdated(uint256 newFeeBps);

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
        revenueWallet = msg.sender;
        resolver = _resolver;
        protocolFeeBps = _feeBps;
        minStake = 0.001 ether;
        maxStake = 0.05 ether;
        disputeTimeout = 24 hours;

        validStakes[0.001 ether] = true;
        validStakes[0.002 ether] = true;
        validStakes[0.005 ether] = true;
        validStakes[0.01 ether]  = true;
        validStakes[0.02 ether]  = true;
        validStakes[0.05 ether]  = true;
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS — MATCHES
    // ══════════════════════════════════════════════════════

    /**
     * @notice Create a match and stake ETH. Money goes into the contract.
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
     *         Money goes into the contract. Emits MatchReady.
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
        emit MatchReady(matchId, m.player1, msg.sender, m.stakeAmount);
    }

    /**
     * @notice Cancel a match before an opponent joins. Refunds stake.
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
    // PLAYER ACTIONS — CLAIM WINNINGS
    // ══════════════════════════════════════════════════════

    /**
     * @notice Claim all accumulated winnings. Pull-over-push pattern.
     *         Winner must come here and call this to receive their ETH.
     *         Money stays in the contract until this is called.
     */
    function claimWinnings() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        require(amount > 0, "Nothing to claim");

        // Effects BEFORE interactions (CEI pattern)
        claimableBalance[msg.sender] = 0;
        playerTotalClaimed[msg.sender] += amount;
        totalPlayerClaimed += amount;

        // Interactions: send ETH
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Claim failed");

        emit WinningsClaimed(msg.sender, amount);
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS — PERK SHOP
    // ══════════════════════════════════════════════════════

    /**
     * @notice Purchase a perk (board). 100% stays in contract as dev earnings.
     */
    function buyPerk(uint256 perkId) external payable whenNotPaused nonReentrant {
        Perk storage p = perks[perkId];
        require(p.active, "Perk not available");
        require(msg.value == p.price, "Wrong price");
        require(!playerPerks[msg.sender][perkId], "Already owned");

        playerPerks[msg.sender][perkId] = true;
        p.totalSold++;
        totalDeveloperEarnings += msg.value;
        totalPerkRevenue += msg.value;

        emit PerkPurchased(perkId, msg.sender, msg.value);
    }

    // ══════════════════════════════════════════════════════
    // RESOLVER ACTIONS (backend server)
    // ══════════════════════════════════════════════════════

    /**
     * @notice Settle a match — credit winner's claimable balance.
     *         NO ETH is transferred here. Winner must call claimWinnings().
     *         4% fee is added to totalDeveloperEarnings.
     */
    function settleMatch(bytes32 matchId, address _winner) external onlyResolver nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        require(_winner == m.player1 || _winner == m.player2, "Invalid winner");

        // ── Check-Effects (NO interactions — money stays in contract) ──
        m.winner = _winner;
        m.state = MatchState.Settled;
        m.settledAt = block.timestamp;

        uint256 pot = m.stakeAmount * 2;
        uint256 fee = (pot * protocolFeeBps) / 10000;
        uint256 payout = pot - fee;

        totalDeveloperEarnings += fee;
        claimableBalance[_winner] += payout;       // Credit winner (no ETH moves)
        playerTotalWinnings[_winner] += payout;     // Lifetime stat

        emit MatchSettled(matchId, _winner, payout, fee);
    }

    /**
     * @notice Flag a match as disputed.
     */
    function disputeMatch(bytes32 matchId) external onlyResolver {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        m.state = MatchState.Disputed;
        emit MatchDisputed(matchId);
    }

    /**
     * @notice Resolve a disputed match. Winner = address(0) refunds both.
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

            totalDeveloperEarnings += fee;
            claimableBalance[_winner] += payout;
            playerTotalWinnings[_winner] += payout;

            emit MatchSettled(matchId, _winner, payout, fee);
        }
    }

    // ══════════════════════════════════════════════════════
    // ADMIN — DEV EARNINGS WITHDRAWAL
    // ══════════════════════════════════════════════════════

    /**
     * @notice Withdraw accumulated developer earnings (match fees + perk sales).
     *         Pull-over-push: one gas-efficient tx to collect all revenue.
     */
    function withdrawEarnings() external onlyOwner nonReentrant {
        uint256 amount = totalDeveloperEarnings;
        require(amount > 0, "No earnings to withdraw");

        // Effects BEFORE transfer (CEI pattern)
        totalDeveloperEarnings = 0;
        totalWithdrawn += amount;

        (bool sent, ) = payable(revenueWallet).call{value: amount}("");
        require(sent, "Withdraw failed");

        emit EarningsWithdrawn(revenueWallet, amount);
    }

    function setRevenueWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        revenueWallet = _newWallet;
        emit RevenueWalletUpdated(_newWallet);
    }

    // ══════════════════════════════════════════════════════
    // ADMIN — PERK MANAGEMENT
    // ══════════════════════════════════════════════════════

    function createPerk(uint256 price) external onlyOwner {
        require(price > 0, "Price must be > 0");
        uint256 id = perkCount++;
        perks[id] = Perk({ price: price, active: true, totalSold: 0 });
        emit PerkCreated(id, price);
    }

    function updatePerk(uint256 perkId, uint256 price, bool active) external onlyOwner {
        require(perkId < perkCount, "Invalid perk");
        perks[perkId].price = price;
        perks[perkId].active = active;
        emit PerkUpdated(perkId, price, active);
    }

    // ══════════════════════════════════════════════════════
    // ADMIN — CONFIG
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

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ══════════════════════════════════════════════════════
    // EMERGENCY
    // ══════════════════════════════════════════════════════

    function emergencyCancel(bytes32 matchId) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        require(
            m.state == MatchState.Active || m.state == MatchState.Disputed,
            "Not eligible"
        );
        require(block.timestamp > m.createdAt + disputeTimeout, "Timeout not reached");

        m.state = MatchState.Cancelled;
        (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
        (bool s2, ) = payable(m.player2).call{value: m.stakeAmount}("");
        require(s1 && s2, "Refund failed");
        emit MatchCancelled(matchId, address(0));
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

    function getPerk(uint256 perkId) external view returns (Perk memory) {
        return perks[perkId];
    }

    function hasPerk(address player, uint256 perkId) external view returns (bool) {
        return playerPerks[player][perkId];
    }

    /**
     * @notice Get a full revenue breakdown for accounting/auditing.
     */
    function getRevenueBreakdown() external view returns (
        uint256 matchFees,
        uint256 perkRevenue,
        uint256 pendingWithdrawal,
        uint256 alreadyWithdrawn
    ) {
        perkRevenue = totalPerkRevenue;
        matchFees = totalDeveloperEarnings > totalPerkRevenue
            ? totalDeveloperEarnings - totalPerkRevenue
            : 0;
        pendingWithdrawal = totalDeveloperEarnings;
        alreadyWithdrawn = totalWithdrawn;
    }

    /**
     * @notice Get player's claim summary.
     */
    function getPlayerClaimInfo(address player) external view returns (
        uint256 claimable,
        uint256 totalWon,
        uint256 totalClaimed,
        uint256 matchesPlayed
    ) {
        claimable = claimableBalance[player];
        totalWon = playerTotalWinnings[player];
        totalClaimed = playerTotalClaimed[player];
        matchesPlayed = playerMatchCount[player];
    }

    // Allow contract to receive ETH directly
    receive() external payable {}
}
