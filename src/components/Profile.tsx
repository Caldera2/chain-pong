'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CHAIN_NAME, IS_TESTNET } from '@/lib/wagmi';
import { apiUpdateProfile, apiExportKey } from '@/lib/api';

export default function Profile() {
  const { username, setUsername, wins, gamesPlayed, totalEarnings, walletBalance, boards, selectedBoard, setScreen, logout, userEmail, isConnected, address, authMethod, gameWallet } = useGameStore();
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(username);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;

  const { leaderboard, playerRank } = useGameStore();

  // Display wallet address — game wallet for email users, real wallet for wallet users
  // After logout, isConnected=false and address=null, so wallet won't show
  const displayWallet = authMethod === 'email' ? gameWallet : (isConnected && address ? address : null);
  const shortWallet = displayWallet ? `${displayWallet.slice(0, 6)}...${displayWallet.slice(-4)}` : null;

  // Show a proper display name — not the wallet address
  const displayName = (() => {
    // If username looks like a wallet address (0x...), show a friendly fallback
    if (username.startsWith('0x') && username.includes('...')) {
      return 'Player';
    }
    return username;
  })();

  // Dynamic rank display
  const rankDisplay = leaderboard.length > 0 ? `Rank #${playerRank}` : 'Unranked';

  // Joined date
  const joinedDate = (() => {
    if (typeof window === 'undefined') return '';
    try {
      const ts = localStorage.getItem('chainpong-joinedat');
      if (ts) {
        const d = new Date(Number(ts));
        return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      }
    } catch {}
    return 'Joined recently';
  })();

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Profile Header */}
          <div className="glass rounded-2xl sm:rounded-3xl p-5 sm:p-8 mb-4 sm:mb-6 text-center">
            <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-gold to-lavender mx-auto mb-3 sm:mb-4 flex items-center justify-center text-3xl sm:text-4xl shadow-[0_0_30px_rgba(212,160,23,0.3)]">
              🏓
            </div>
            {editing ? (
              <div className="flex items-center justify-center gap-2 mb-2">
                <input
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-center text-white focus:outline-none focus:border-gold"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      // Save to backend first, then update local
                      await apiUpdateProfile({ username: tempName });
                      setUsername(tempName);
                      setEditing(false);
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    // Save to backend first, then update local
                    await apiUpdateProfile({ username: tempName });
                    setUsername(tempName);
                    setEditing(false);
                  }}
                  className="text-mint hover:underline text-sm"
                >
                  Save
                </button>
              </div>
            ) : (
              <h2 className="text-2xl font-bold text-white mb-1">
                {displayName}
                <button onClick={() => setEditing(true)} className="ml-2 text-gray-500 hover:text-white text-sm">
                  ✏️
                </button>
              </h2>
            )}
            <p className="text-gray-500 text-sm">
              {authMethod === 'email' ? 'Email Account' : 'Wallet Account'} • {rankDisplay} • {joinedDate}
            </p>
            {/* Show wallet address separately below, only when connected */}
            {shortWallet && (
              <p className="text-gray-600 text-xs font-mono mt-1">{shortWallet}</p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
            {[
              { label: 'Total Wins', value: wins, color: 'text-mint' },
              { label: 'Games Played', value: gamesPlayed, color: 'text-gold-light' },
              { label: 'Earnings', value: `${totalEarnings.toFixed(4)} ETH`, color: 'text-gold' },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-3 sm:p-4 text-center">
                <div className={`text-lg sm:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] sm:text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Wallet Section */}
          <div className={`rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 ${displayWallet ? 'glass' : 'border-2 border-dashed border-gold/30 bg-gold/5'}`}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                🔗 Wallet
              </h3>
              {displayWallet && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  authMethod === 'email'
                    ? 'bg-lavender/10 text-lavender'
                    : 'bg-mint/10 text-mint'
                }`}>
                  {authMethod === 'email' ? 'Game Wallet' : 'Connected'}
                </span>
              )}
            </div>

            {displayWallet ? (
              <>
                {/* Wallet info */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Address</span>
                    <span className="text-gray-300 font-mono text-xs sm:text-sm">
                      {shortWallet}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Network</span>
                    <span className="text-gold-light font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                      {CHAIN_NAME}
                      {IS_TESTNET && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">TESTNET</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Balance</span>
                    <span className="text-gold font-bold text-base sm:text-lg">
                      {authMethod === 'wallet' ? walletBalance.toFixed(4) : totalEarnings.toFixed(4)} ETH
                    </span>
                  </div>
                  {authMethod === 'email' && (
                    <div className="flex items-start gap-2 bg-lavender/5 border border-lavender/10 rounded-xl p-3 mt-2">
                      <span className="text-sm mt-0.5">🎮</span>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        This is your <span className="text-lavender font-medium">game wallet</span> created automatically with your email account. Your match earnings are stored here.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setScreen('withdraw')}
                    className="flex-1 btn-primary py-2.5 sm:py-3 rounded-xl font-semibold text-white text-sm"
                  >
                    Withdraw
                  </button>
                  {/* Deposit only for email users (game wallet) — wallet users manage their own funds */}
                  {authMethod === 'email' && (
                    <button
                      onClick={() => setScreen('deposit')}
                      className="flex-1 btn-secondary py-2.5 sm:py-3 rounded-xl font-semibold text-white text-sm"
                    >
                      Deposit
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Not connected state */}
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                  Connect your Base wallet to withdraw earnings, buy boards on-chain, and unlock the full Chain Pong experience.
                </p>

                <div className="space-y-2 mb-5">
                  {[
                    { icon: '💸', text: 'Withdraw your match earnings to your wallet' },
                    { icon: '🛒', text: 'Buy boards with unique perks using ETH' },
                    { icon: '🏆', text: 'Compete in ranked PvP for real stakes' },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2.5 text-sm">
                      <span className="shrink-0">{item.icon}</span>
                      <span className="text-gray-300">{item.text}</span>
                    </div>
                  ))}
                </div>

                <ConnectButton.Custom>
                  {({ openConnectModal, mounted }) => (
                    mounted && (
                      <button
                        onClick={openConnectModal}
                        className="w-full btn-primary py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base flex items-center justify-center gap-2"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                          <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
                          <path d="M16 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
                          <path d="M6 6V5a3 3 0 013-3h6a3 3 0 013 3v1" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        Connect Base Wallet
                      </button>
                    )
                  )}
                </ConnectButton.Custom>

                <p className="text-[10px] sm:text-xs text-gray-600 text-center mt-3">
                  Supports MetaMask, Coinbase Wallet, WalletConnect & more
                </p>
              </>
            )}
          </div>

          {/* Current Board */}
          <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-white mb-4">Active Board</h3>
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-2xl sm:text-3xl shrink-0"
                style={{ background: `${currentBoard.color}20` }}
              >
                {currentBoard.perkIcon}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white">{currentBoard.name}</div>
                <div className="text-sm" style={{ color: currentBoard.color }}>{currentBoard.perk}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{currentBoard.perkDescription}</div>
              </div>
            </div>
          </div>

          {/* Owned Boards */}
          <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">My Boards ({ownedBoards.length}/{boards.length})</h3>
              <button onClick={() => setScreen('shop')} className="text-sm text-gold-light hover:underline">
                Get More →
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-2 sm:gap-3">
              {boards.map((board) => (
                <div
                  key={board.id}
                  className={`rounded-xl p-2 sm:p-3 text-center transition-all ${
                    board.owned ? 'glass' : 'bg-white/[0.02] opacity-40'
                  }`}
                >
                  <div className="text-xl sm:text-2xl mb-0.5 sm:mb-1">{board.perkIcon}</div>
                  <div className="text-[10px] sm:text-xs font-medium text-white truncate">{board.name}</div>
                  {!board.owned && <div className="text-[10px] text-gray-600 mt-0.5">🔒</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Transaction History Link */}
          <button
            onClick={() => setScreen('transactions')}
            className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 w-full text-left hover:border-lavender/30 transition-all group flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lavender/10 border border-lavender/20 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender" />
                  <path d="M9 12H15M9 16H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Transaction History</div>
                <div className="text-xs text-gray-500">View deposits, withdrawals & earnings</div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-600 group-hover:text-lavender transition-colors">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Account Info & Logout */}
          <div className="glass rounded-2xl p-4 sm:p-6">
            <h3 className="text-lg font-bold text-white mb-4">Account</h3>
            <div className="space-y-3 mb-4">
              {authMethod === 'email' && userEmail && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Email</span>
                  <span className="text-gray-300 text-xs sm:text-sm truncate ml-4">{userEmail}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Auth Method</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  authMethod === 'email'
                    ? 'bg-gold/10 text-gold-light'
                    : 'bg-lavender/10 text-lavender'
                }`}>
                  {authMethod === 'email' ? '📧 Email' : '🔗 Wallet'}
                </span>
              </div>
              {displayWallet && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{authMethod === 'email' ? 'Game Wallet' : 'Wallet'}</span>
                  <span className="text-gold-light text-xs font-mono">{shortWallet}</span>
                </div>
              )}
            </div>
            {/* Export Private Key — email users only */}
            {authMethod === 'email' && (
              <div className="mb-3">
                {!showPrivateKey ? (
                  <button
                    onClick={async () => {
                      if (!confirm('This will reveal your private key. Anyone with this key has full control of your wallet funds. Continue?')) return;
                      setKeyLoading(true);
                      try {
                        const res = await apiExportKey();
                        if (res.success && res.data) {
                          setPrivateKey(res.data.privateKey);
                          setShowPrivateKey(true);
                        }
                      } catch {}
                      setKeyLoading(false);
                    }}
                    disabled={keyLoading}
                    className="w-full py-2.5 sm:py-3 rounded-xl font-semibold text-gold-light text-sm border border-gold/20 hover:bg-gold/10 transition-all"
                  >
                    {keyLoading ? 'Loading...' : 'Export Private Key'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-red-400 font-semibold mb-1.5">WARNING: Never share this key!</p>
                      <p className="text-[10px] text-gray-400 mb-2">Import this key into MetaMask or any Ethereum wallet to access your funds.</p>
                      <div className="bg-black/40 rounded-lg p-2 font-mono text-[10px] text-gold-light break-all select-all">
                        {privateKey}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(privateKey || '');
                        }}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-mint border border-mint/20 hover:bg-mint/10 transition-all"
                      >
                        Copy Key
                      </button>
                      <button
                        onClick={() => { setShowPrivateKey(false); setPrivateKey(null); }}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-400 border border-white/10 hover:bg-white/5 transition-all"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={logout}
              className="w-full py-2.5 sm:py-3 rounded-xl font-semibold text-red-400 text-sm border border-red-400/20 hover:bg-red-400/10 transition-all"
            >
              Log Out
            </button>
          </div>
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-6 sm:mt-8 text-gray-500 hover:text-white transition-colors mx-auto block text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
