// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ChainPongEscrow
 * @author Chain Pong Team
 * @notice Trustless 1v1 game escrow with EIP-712 permits, claim-based payouts,
 *         timeout refunds, and pull-over-push revenue withdrawal on Base.
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
        uint256       joinedAt;         // when player2 joined (for settle timeout)
        uint256       settledAt;
    }

    struct Perk {
        uint256 price;
        bool    active;
        uint256 totalSold;
    }

    // ══════════════════════════════════════════════════════
    // CONSTANTS
    // ══════════════════════════════════════════════════════

    uint256 public constant CANCEL_TIMEOUT   = 5 minutes;   // No opponent → refund
    uint256 public constant SETTLE_TIMEOUT   = 30 minutes;  // No settlement → refund
    uint256 public constant CLAIM_GRACE_PERIOD = 1 hours;   // Winnings locked before claimable

    // EIP-712 domain separator components
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant MATCH_PERMIT_TYPEHASH = keccak256(
        "MatchPermit(bytes32 matchId,address player,uint256 stakeAmount,uint256 deadline)"
    );
    bytes32 public constant SETTLE_PROOF_TYPEHASH = keccak256(
        "SettleProof(bytes32 matchId,address winner,uint256 player1Score,uint256 player2Score,uint256 deadline)"
    );

    // Cached domain separator — recomputed if chainId changes (fork protection)
    bytes32 private _cachedDomainSeparator;
    uint256 private _cachedChainId;

    // ══════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════

    address public owner;
    address public resolver;            // backend address — signs EIP-712 proofs
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

    // ── Player Balances (claim-based with grace period) ──
    mapping(address => uint256)   public claimableBalance;      // unclaimed winnings
    mapping(address => uint256)   public claimableAfter;        // timestamp: when claims unlock
    mapping(address => uint256)   public playerTotalWinnings;   // lifetime stat
    mapping(address => uint256)   public playerTotalClaimed;    // lifetime claimed

    // ── Mappings ─────────────────────────────────────────
    mapping(bytes32 => Match)     public matches;
    mapping(address => uint256)   public playerMatchCount;
    mapping(uint256 => bool)      public validStakes;
    mapping(bytes32 => bool)      public usedPermits;           // prevent permit replay

    // ── Perk Shop ────────────────────────────────────────
    uint256 public perkCount;
    mapping(uint256 => Perk)                public perks;
    mapping(address => mapping(uint256 => bool)) public playerPerks;

    bool private _locked;

    // ── Dispute Circuit Breaker ─────────────────────────
    // Prevents a compromised admin key from mass-clawing back
    // all winners' pending balances in a single attack.
    uint256 public disputesThisWindow;       // disputes in current 1-hour window
    uint256 public disputeWindowStart;       // start of current window
    uint256 public maxDisputesPerWindow;     // max disputes before lock (default 5)
    bool    public disputeCircuitBroken;     // true = adminDisputeMatch locked

    // ══════════════════════════════════════════════════════
    // EVENTS
    // ══════════════════════════════════════════════════════

    event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 stakeAmount);
    event MatchJoined(bytes32 indexed matchId, address indexed player2);
    event MatchReady(bytes32 indexed matchId, address player1, address player2, uint256 stakeAmount);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event MatchCancelled(bytes32 indexed matchId, address indexed player, string reason);
    event MatchDisputed(bytes32 indexed matchId);
    event SettlementReverted(bytes32 indexed matchId, address indexed formerWinner, uint256 amountClawed);

    event WinningsClaimed(address indexed player, uint256 amount);
    event PerkCreated(uint256 indexed perkId, uint256 price);
    event PerkPurchased(uint256 indexed perkId, address indexed buyer, uint256 price);
    event PerkUpdated(uint256 indexed perkId, uint256 price, bool active);

    event EarningsWithdrawn(address indexed to, uint256 amount);
    event RevenueWalletUpdated(address indexed newWallet);
    event StakeTierUpdated(uint256 amount, bool enabled);
    event ResolverUpdated(address indexed newResolver);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event GlobalPause(bool paused, address triggeredBy);
    event DisputeCircuitBroken(uint256 disputeCount, uint256 window);
    event DisputeCircuitReset(address resetBy);

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
        maxDisputesPerWindow = 5; // max 5 disputes per hour before circuit breaks

        validStakes[0.001 ether] = true;
        validStakes[0.002 ether] = true;
        validStakes[0.005 ether] = true;
        validStakes[0.01 ether]  = true;
        validStakes[0.02 ether]  = true;
        validStakes[0.05 ether]  = true;

        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    /// @dev Compute the EIP-712 domain separator for the current chain.
    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256("ChainPongEscrow"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    /// @dev Return cached separator if chainId unchanged, recompute on fork.
    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    // ══════════════════════════════════════════════════════
    // EIP-712 SIGNATURE VERIFICATION
    // ══════════════════════════════════════════════════════

    /// @notice Verify a resolver-signed EIP-712 match permit. Prevents ghost matches.
    function _verifyMatchPermit(
        bytes32 matchId,
        address player,
        uint256 stakeAmount,
        uint256 deadline,
        bytes memory signature
    ) internal {
        require(block.timestamp <= deadline, "Permit expired");

        bytes32 permitHash = keccak256(abi.encode(
            MATCH_PERMIT_TYPEHASH,
            matchId,
            player,
            stakeAmount,
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), permitHash));

        // Prevent replay
        require(!usedPermits[digest], "Permit already used");
        usedPermits[digest] = true;

        address signer = _recover(digest, signature);
        require(signer == resolver, "Invalid permit signature");
    }

    /// @notice Verify a resolver-signed EIP-712 settle proof (cryptographic audit trail).
    function _verifySettleProof(
        bytes32 matchId,
        address winner,
        uint256 player1Score,
        uint256 player2Score,
        uint256 deadline,
        bytes memory signature
    ) internal view {
        require(block.timestamp <= deadline, "Proof expired");

        bytes32 proofHash = keccak256(abi.encode(
            SETTLE_PROOF_TYPEHASH,
            matchId,
            winner,
            player1Score,
            player2Score,
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), proofHash));
        address signer = _recover(digest, signature);
        require(signer == resolver, "Invalid settle signature");
    }

    /// @dev ECDSA.recover without OpenZeppelin dependency.
    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid signature v");

        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "Invalid signature");
        return signer;
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS — MATCHES
    // ══════════════════════════════════════════════════════

    /// @notice Create a match. Requires a backend-signed EIP-712 permit.
    function createMatch(
        bytes32 matchId,
        uint256 deadline,
        bytes calldata permit
    ) external payable whenNotPaused nonReentrant {
        require(matches[matchId].state == MatchState.Empty, "Match ID exists");
        require(validStakes[msg.value], "Invalid stake amount");

        // Verify backend approved this match creation
        _verifyMatchPermit(matchId, msg.sender, msg.value, deadline, permit);

        matches[matchId] = Match({
            id: matchId,
            player1: msg.sender,
            player2: address(0),
            stakeAmount: msg.value,
            state: MatchState.WaitingP2,
            winner: address(0),
            createdAt: block.timestamp,
            joinedAt: 0,
            settledAt: 0
        });

        playerMatchCount[msg.sender]++;
        totalMatches++;
        totalVolume += msg.value;

        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    /// @notice Join an existing match. Requires a backend-signed EIP-712 permit.
    function joinMatch(
        bytes32 matchId,
        uint256 deadline,
        bytes calldata permit
    ) external payable whenNotPaused nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.WaitingP2, "Not joinable");
        require(msg.sender != m.player1, "Can't play yourself");
        require(msg.value == m.stakeAmount, "Stake mismatch");

        // Verify backend approved this player joining
        _verifyMatchPermit(matchId, msg.sender, msg.value, deadline, permit);

        m.player2 = msg.sender;
        m.state = MatchState.Active;
        m.joinedAt = block.timestamp;

        playerMatchCount[msg.sender]++;
        totalVolume += msg.value;

        emit MatchJoined(matchId, msg.sender);
        emit MatchReady(matchId, m.player1, msg.sender, m.stakeAmount);
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS — CANCEL / REFUND
    // ══════════════════════════════════════════════════════

    /// @notice Cancel a match before an opponent joins.
    /// @dev CEI: state set to Cancelled BEFORE ETH transfer. nonReentrant guard.
    function cancelMatch(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];

        // ── Checks ──
        require(m.player1 == msg.sender, "Not your match");
        require(m.state == MatchState.WaitingP2, "Can't cancel");

        // ── Effects ── (state change before interaction)
        uint256 refundAmount = m.stakeAmount;
        m.state = MatchState.Cancelled;

        // ── Interactions ──
        (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
        require(sent, "Refund failed");

        emit MatchCancelled(matchId, msg.sender, "Player cancelled");
    }

    /// @dev Emitted when one of two refunds in a dual-refund scenario fails.
    /// The failed refund is tracked so the admin can manually resolve it.
    event RefundFailed(bytes32 indexed matchId, address indexed player, uint256 amount);

    /// @notice Refund stuck matches: 5min no-join or 30min no-settlement.
    /// @dev CEI: state set to Cancelled BEFORE any ETH transfers. nonReentrant guard.
    ///      Scenario 2 uses independent transfers so a malicious player2 contract
    ///      cannot grief player1's refund (and vice versa).
    function requestRefund(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];

        // ── Scenario 1: No opponent joined after 5 minutes ──
        if (m.state == MatchState.WaitingP2) {
            // Checks
            require(m.player1 == msg.sender, "Not your match");
            require(
                block.timestamp > m.createdAt + CANCEL_TIMEOUT,
                "Wait 5 minutes before requesting refund"
            );

            // Effects
            uint256 refundAmount = m.stakeAmount;
            m.state = MatchState.Cancelled;

            // Interactions
            (bool sent, ) = payable(m.player1).call{value: refundAmount}("");
            require(sent, "Refund failed");

            emit MatchCancelled(matchId, msg.sender, "No opponent timeout");
            return;
        }

        // ── Scenario 2: Both joined but no settlement after 30 minutes ──
        if (m.state == MatchState.Active) {
            // Checks
            require(
                msg.sender == m.player1 || msg.sender == m.player2,
                "Not a participant"
            );
            require(
                block.timestamp > m.joinedAt + SETTLE_TIMEOUT,
                "Wait 30 minutes before requesting refund"
            );

            // Effects — snapshot values and set state BEFORE any transfers
            uint256 refundAmount = m.stakeAmount;
            address p1 = m.player1;
            address p2 = m.player2;
            m.state = MatchState.Cancelled;

            // Interactions — independent transfers prevent griefing.
            // If player2 is a malicious contract that reverts on receive,
            // player1 still gets their refund (and vice versa).
            (bool s1, ) = payable(p1).call{value: refundAmount}("");
            if (!s1) {
                emit RefundFailed(matchId, p1, refundAmount);
            }

            (bool s2, ) = payable(p2).call{value: refundAmount}("");
            if (!s2) {
                emit RefundFailed(matchId, p2, refundAmount);
            }

            // At least one refund must succeed
            require(s1 || s2, "Both refunds failed");

            emit MatchCancelled(matchId, address(0), "Settlement timeout");
            return;
        }

        revert("Match not eligible for refund");
    }

    // ══════════════════════════════════════════════════════
    // PLAYER ACTIONS — CLAIM WINNINGS
    // ══════════════════════════════════════════════════════

    /// @notice Claim accumulated winnings. Subject to 1-hour grace period after settlement.
    function claimWinnings() external nonReentrant whenNotPaused {
        uint256 amount = claimableBalance[msg.sender];
        require(amount > 0, "Nothing to claim");
        require(
            block.timestamp >= claimableAfter[msg.sender],
            "Grace period active - try again later"
        );

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

    /// @notice Purchase a perk. 100% of ETH credited to developer earnings.
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

    /// @notice Settle a match with EIP-712 proof. Credits winner's claimable balance (no ETH moves).
    function settleMatch(
        bytes32 matchId,
        address _winner,
        uint256 player1Score,
        uint256 player2Score,
        uint256 deadline,
        bytes calldata proof
    ) external onlyResolver nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        require(_winner == m.player1 || _winner == m.player2, "Invalid winner");

        // Verify EIP-712 cryptographic proof from the backend
        _verifySettleProof(matchId, _winner, player1Score, player2Score, deadline, proof);

        // ── Check-Effects (NO interactions — money stays in contract) ──
        m.winner = _winner;
        m.state = MatchState.Settled;
        m.settledAt = block.timestamp;

        uint256 pot = m.stakeAmount * 2;
        uint256 fee = (pot * protocolFeeBps) / 10000;
        uint256 payout = pot - fee;

        totalDeveloperEarnings += fee;
        claimableBalance[_winner] += payout;
        playerTotalWinnings[_winner] += payout;

        // Grace period: winner can't claim for 1 hour (gives admin time to review)
        uint256 unlockTime = block.timestamp + CLAIM_GRACE_PERIOD;
        if (unlockTime > claimableAfter[_winner]) {
            claimableAfter[_winner] = unlockTime;
        }

        emit MatchSettled(matchId, _winner, payout, fee);
    }

    /// @notice Flag a match as disputed.
    function disputeMatch(bytes32 matchId) external onlyResolver {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Not active");
        m.state = MatchState.Disputed;
        emit MatchDisputed(matchId);
    }

    /// @notice Revert a settled match during the 1-hour grace period. Claws back claimable balance
    ///         and moves the match to Disputed so the admin can refund or re-assign via resolveDispute().
    function adminDisputeMatch(bytes32 matchId) external onlyOwner {
        require(!disputeCircuitBroken, "Dispute circuit breaker active");

        Match storage m = matches[matchId];
        require(m.state == MatchState.Settled, "Not settled");
        require(
            block.timestamp < m.settledAt + CLAIM_GRACE_PERIOD,
            "Grace period expired"
        );

        // ── Dispute rate limiter ────────────────────────
        // Reset window if 1 hour has passed
        if (block.timestamp > disputeWindowStart + 1 hours) {
            disputesThisWindow = 0;
            disputeWindowStart = block.timestamp;
        }
        disputesThisWindow++;

        // Trip circuit breaker if too many disputes in this window
        if (disputesThisWindow > maxDisputesPerWindow) {
            disputeCircuitBroken = true;
            emit DisputeCircuitBroken(disputesThisWindow, disputeWindowStart);
            revert("Dispute rate limit exceeded - circuit breaker tripped");
        }

        address formerWinner = m.winner;
        uint256 pot = m.stakeAmount * 2;
        uint256 fee = (pot * protocolFeeBps) / 10000;
        uint256 payout = pot - fee;

        // Claw back the credited winnings
        require(claimableBalance[formerWinner] >= payout, "Already claimed");
        claimableBalance[formerWinner] -= payout;
        playerTotalWinnings[formerWinner] -= payout;
        totalDeveloperEarnings -= fee;

        // Reset match state for admin review
        m.state = MatchState.Disputed;
        m.winner = address(0);
        m.settledAt = 0;

        emit SettlementReverted(matchId, formerWinner, payout);
        emit MatchDisputed(matchId);
    }

    /// @notice Resolve a disputed match. Pass address(0) as winner to refund both.
    function resolveDispute(bytes32 matchId, address _winner) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Disputed, "Not disputed");

        if (_winner == address(0)) {
            m.state = MatchState.Cancelled;
            (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
            (bool s2, ) = payable(m.player2).call{value: m.stakeAmount}("");
            require(s1 && s2, "Refund failed");
            emit MatchCancelled(matchId, address(0), "Dispute refund");
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

            uint256 unlockTime = block.timestamp + CLAIM_GRACE_PERIOD;
            if (unlockTime > claimableAfter[_winner]) {
                claimableAfter[_winner] = unlockTime;
            }

            emit MatchSettled(matchId, _winner, payout, fee);
        }
    }

    // ══════════════════════════════════════════════════════
    // ADMIN — DEV EARNINGS WITHDRAWAL
    // ══════════════════════════════════════════════════════

    function withdrawEarnings() external onlyOwner nonReentrant {
        uint256 amount = totalDeveloperEarnings;
        require(amount > 0, "No earnings to withdraw");

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

    function setMinStake(uint256 _minStake) external onlyOwner {
        require(_minStake > 0, "Min stake must be > 0");
        require(_minStake <= maxStake, "Min > max");
        minStake = _minStake;
    }

    function setMaxStake(uint256 _maxStake) external onlyOwner {
        require(_maxStake >= minStake, "Max < min");
        maxStake = _maxStake;
    }

    function setStakeTier(uint256 amount, bool enabled) external onlyOwner {
        validStakes[amount] = enabled;
        emit StakeTierUpdated(amount, enabled);
    }

    /// @notice Toggle global pause. Refunds and dev withdrawals remain available.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit GlobalPause(_paused, msg.sender);
    }

    function setDisputeTimeout(uint256 _timeout) external onlyOwner {
        disputeTimeout = _timeout;
    }

    /// @notice Reset the dispute circuit breaker after investigation.
    function resetDisputeCircuitBreaker() external onlyOwner {
        disputeCircuitBroken = false;
        disputesThisWindow = 0;
        disputeWindowStart = block.timestamp;
        emit DisputeCircuitReset(msg.sender);
    }

    /// @notice Set the maximum number of disputes allowed per 1-hour window.
    function setMaxDisputesPerWindow(uint256 _max) external onlyOwner {
        require(_max > 0, "Must allow at least 1");
        maxDisputesPerWindow = _max;
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

        if (m.player2 != address(0)) {
            (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
            (bool s2, ) = payable(m.player2).call{value: m.stakeAmount}("");
            require(s1 && s2, "Refund failed");
        } else {
            (bool s1, ) = payable(m.player1).call{value: m.stakeAmount}("");
            require(s1, "Refund failed");
        }

        emit MatchCancelled(matchId, address(0), "Emergency cancel");
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

    function getPlayerClaimInfo(address player) external view returns (
        uint256 claimable,
        uint256 unlockTimestamp,
        uint256 totalWon,
        uint256 totalClaimed,
        uint256 matchesPlayed
    ) {
        claimable = claimableBalance[player];
        unlockTimestamp = claimableAfter[player];
        totalWon = playerTotalWinnings[player];
        totalClaimed = playerTotalClaimed[player];
        matchesPlayed = playerMatchCount[player];
    }

    receive() external payable {}
}
