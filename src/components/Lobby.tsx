'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { IS_TESTNET, CHAIN_NAME, TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect, useState } from 'react';
import { apiGetMatch, apiCancelMatch } from '@/lib/api';

interface ActiveMatch {
  matchId: string;
  board: string;
  stake: number;
  timestamp: number;
}

export default function Lobby() {
  const { setScreen, wins, losses, totalEarnings, totalLost, walletBalance, balance, username, leaderboard, authMethod, gameWallet, fetchLeaderboard, syncFromBackend, setCurrentMatchId, setPvpStakeAmount, setSelectedBoard } = useGameStore();
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);

  // Sync from backend on mount
  useEffect(() => {
    syncFromBackend();
    fetchLeaderboard();
  }, [syncFromBackend, fetchLeaderboard]);

  // Check for active match on mount (reconnection)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chainpong-active-match');
      if (saved) {
        const match: ActiveMatch = JSON.parse(saved);
        // Only show if less than 30 minutes old
        if (Date.now() - match.timestamp < 30 * 60 * 1000) {
          // Verify match is still active on backend
          apiGetMatch(match.matchId).then((res) => {
            if (res.success && res.data) {
              const status = (res.data as any).status;
              if (status === 'PENDING' || status === 'MATCHED' || status === 'IN_PROGRESS') {
                setActiveMatch(match);
              } else {
                localStorage.removeItem('chainpong-active-match');
              }
            } else {
              localStorage.removeItem('chainpong-active-match');
            }
          }).catch(() => localStorage.removeItem('chainpong-active-match'));
        } else {
          localStorage.removeItem('chainpong-active-match');
        }
      }
    } catch {}
  }, []);

  const handleResumeMatch = () => {
    if (!activeMatch) return;
    setCurrentMatchId(activeMatch.matchId);
    setPvpStakeAmount(activeMatch.stake);
    setSelectedBoard(activeMatch.board);
    setScreen('game');
  };

  const handleDismissMatch = async () => {
    if (activeMatch) {
      try {
        await apiCancelMatch(activeMatch.matchId);
      } catch {}
    }
    localStorage.removeItem('chainpong-active-match');
    setActiveMatch(null);
    setCurrentMatchId(null);
  };

  const netEarnings = totalEarnings - totalLost;
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <motion.div
          className="text-center mb-6 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 mb-3 sm:mb-4">
            {IS_TESTNET && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium tracking-wider uppercase">
                {CHAIN_NAME} Testnet
              </span>
            )}
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-mint/10 text-mint border border-mint/20 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-mint online-dot" />
              Live
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-2 sm:mb-3 tracking-tight">
            Welcome back, <span className="neon-text text-gold-light">{username}</span>
          </h1>
          <p className="text-gray-500 text-sm sm:text-lg">Ready to dominate the table?</p>
          {authMethod === 'email' && gameWallet && (
            <p className="text-gray-700 text-xs mt-2 font-mono">
              Game Wallet: {gameWallet.slice(0, 6)}...{gameWallet.slice(-4)}
            </p>
          )}
        </motion.div>

        {/* Active Match Reconnection Banner */}
        {activeMatch && (
          <motion.div
            className="glass-elevated rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-6 sm:mb-8 border border-gold/20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center animate-pulse">
                  <span className="text-lg">🏓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Active Match Found</p>
                  <p className="text-xs text-gray-500">Stake: {activeMatch.stake} {TOKEN_SYMBOL}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDismissMatch}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResumeMatch}
                  className="text-xs px-4 py-1.5 rounded-lg btn-primary font-semibold"
                >
                  Resume
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick stats — premium cards */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {[
            { label: 'Wins', value: wins, color: 'text-mint', glowClass: 'glass-glow-mint', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" className="text-mint"/></svg>) },
            { label: 'Losses', value: losses, color: 'text-coral', glowClass: 'glass-glow-coral', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22Z" stroke="currentColor" strokeWidth="2" className="text-coral"/><path d="M15 9L9 15M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-coral"/></svg>) },
            { label: 'Earned', value: `${totalEarnings.toFixed(4)}`, color: 'text-gold', glowClass: 'glass-glow-gold', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M12 1V23M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gold"/></svg>), sub: totalLost > 0 ? `Lost: ${totalLost.toFixed(4)}` : undefined, unit: TOKEN_SYMBOL },
            { label: 'Balance', value: `${effectiveBalance.toFixed(4)}`, color: netEarnings >= 0 ? 'text-lavender' : 'text-red-400', glowClass: 'glass-glow-lavender', icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" className="text-lavender"/><path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender"/></svg>), sub: netEarnings >= 0 ? `Net: +${netEarnings.toFixed(4)}` : `Net: ${netEarnings.toFixed(4)}`, unit: TOKEN_SYMBOL },
          ].map((stat) => (
            <div key={stat.label} className={`${stat.glowClass} rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center stat-card card-shine`}>
              <div className="mb-1 sm:mb-2 opacity-60">{stat.icon}</div>
              <div className={`text-sm sm:text-2xl font-bold ${stat.color} truncate`}>
                {stat.value}
                {(stat as any).unit && <span className="text-[10px] sm:text-xs ml-1 opacity-60">{(stat as any).unit}</span>}
              </div>
              <div className="text-[10px] sm:text-sm text-gray-500 mt-0.5 sm:mt-1 uppercase tracking-wider font-medium">{stat.label}</div>
              {(stat as any).sub && (
                <div className="text-[9px] sm:text-xs text-gray-600 mt-0.5">{(stat as any).sub}</div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Main Actions — Play & Stake + Board Shop */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Play & Stake Card */}
          <button
            onClick={() => setScreen('mode-select')}
            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/15 via-neon-orange/10 to-transparent" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-gold/10 to-transparent" />
            <div className="absolute inset-[1px] rounded-2xl sm:rounded-3xl border border-gold/20 group-hover:border-gold/40 transition-colors" />
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex sm:block items-center gap-4">
              <div className="text-4xl sm:text-5xl sm:mb-4 shrink-0">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="w-10 h-10 sm:w-12 sm:h-12">
                  <circle cx="24" cy="24" r="20" stroke="url(#playGrad)" strokeWidth="2.5" opacity="0.3"/>
                  <polygon points="20,16 34,24 20,32" fill="url(#playGrad)"/>
                  <defs><linearGradient id="playGrad" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor="#f5d060"/><stop offset="100%" stopColor="#d4a017"/></linearGradient></defs>
                </svg>
              </div>
              <div>
                <h2 className="text-xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 tracking-tight">Play & Stake</h2>
                <p className="text-gray-400 text-sm sm:text-base">Challenge real players — winner takes the pot</p>
                <div className="mt-2 sm:mt-6 inline-flex items-center gap-2 text-gold-light font-semibold text-sm sm:text-base group-hover:gap-3 transition-all">
                  Start Match
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          {/* Skill Shop Card */}
          <button
            onClick={() => setScreen('shop')}
            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-lavender/15 via-neon-purple/10 to-transparent" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-lavender/10 to-transparent" />
            <div className="absolute inset-[1px] rounded-2xl sm:rounded-3xl border border-lavender/20 group-hover:border-lavender/40 transition-colors" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-lavender/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex sm:block items-center gap-4">
              <div className="text-4xl sm:text-5xl sm:mb-4 shrink-0">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="w-10 h-10 sm:w-12 sm:h-12">
                  <rect x="8" y="12" width="32" height="24" rx="4" stroke="url(#shopGrad)" strokeWidth="2.5" opacity="0.3"/>
                  <path d="M16 20L22 26L32 16" stroke="url(#shopGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs><linearGradient id="shopGrad" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
                </svg>
              </div>
              <div>
                <h2 className="text-xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 tracking-tight">Skill Shop</h2>
                <p className="text-gray-400 text-sm sm:text-base">Pro boards with unique perks</p>
                <div className="mt-2 sm:mt-6 inline-flex items-center gap-2 text-lavender font-semibold text-sm sm:text-base group-hover:gap-3 transition-all">
                  Browse Items
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </button>
        </motion.div>

        {/* Secondary Actions */}
        <motion.div
          className="grid grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setScreen('leaderboard')}
            className="glass glass-hover rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center transition-all hover:scale-[1.02] group"
          >
            <div className="mb-1 sm:mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gold group-hover:text-gold-light transition-colors"/></svg>
            </div>
            <div className="font-semibold text-white text-[10px] sm:text-sm">Champions</div>
          </button>
          <button
            onClick={() => setScreen('withdraw')}
            className="glass glass-hover rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center transition-all hover:scale-[1.02] group"
          >
            <div className="mb-1 sm:mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint group-hover:text-mint transition-colors"/><path d="M5 19H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-mint"/></svg>
            </div>
            <div className="font-semibold text-white text-[10px] sm:text-sm">Claim</div>
          </button>
          <button
            onClick={() => setScreen('referral')}
            className="glass glass-hover rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center transition-all hover:scale-[1.02] group"
          >
            <div className="mb-1 sm:mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><path d="M16 21V19C16 16.7909 14.2091 15 12 15H5C2.79086 15 1 16.7909 1 19V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-coral group-hover:text-coral transition-colors"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" className="text-coral"/><path d="M20 8V14M17 11H23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-coral"/></svg>
            </div>
            <div className="font-semibold text-white text-[10px] sm:text-sm">Invite</div>
          </button>
          <button
            onClick={() => setScreen('profile')}
            className="glass glass-hover rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center transition-all hover:scale-[1.02] group"
          >
            <div className="mb-1 sm:mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" className="text-lavender group-hover:text-lavender transition-colors"/><path d="M6 21V19C6 17.3431 7.34315 16 9 16H15C16.6569 16 18 17.3431 18 19V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-lavender"/></svg>
            </div>
            <div className="font-semibold text-white text-[10px] sm:text-sm">Profile</div>
          </button>
        </motion.div>

        {/* Live Matches / Top Players Panel */}
        <motion.div
          className="glass-elevated rounded-xl sm:rounded-2xl p-4 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" className="text-gold"/></svg>
              Champion&apos;s Board
            </h3>
            <button
              onClick={() => setScreen('leaderboard')}
              className="text-xs sm:text-sm text-gold-light hover:text-gold transition-colors font-medium"
            >
              View All →
            </button>
          </div>
          {leaderboard.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gold/5 border border-gold/10 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gold/40"/></svg>
              </div>
              <p className="text-gray-500 text-sm font-medium">No players yet</p>
              <p className="text-gray-600 text-xs mt-1">Be the first to play and claim #1!</p>
            </div>
          ) : (
            <div className="space-y-1 sm:space-y-2">
              {leaderboard.slice(0, 5).map((entry, i) => (
                <div key={entry.rank} className={`flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg transition-colors ${entry.isPlayer ? 'bg-gold/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' :
                      entry.rank === 2 ? 'bg-gray-400/10 text-gray-300 border border-gray-400/20' :
                      entry.rank === 3 ? 'bg-amber-600/10 text-amber-500 border border-amber-600/20' :
                      entry.isPlayer ? 'bg-gold/10 text-gold-light border border-gold/20' :
                      'bg-white/5 text-gray-500 border border-white/5'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="text-base sm:text-xl shrink-0">{entry.avatar}</span>
                    <span className={`font-medium text-sm sm:text-base truncate ${entry.isPlayer ? 'text-gold-light' : 'text-white'}`}>
                      {entry.username}{entry.isPlayer ? ' (You)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0 ml-2">
                    <span className="text-mint font-semibold">{entry.wins}W</span>
                    <span className="text-gold hidden sm:inline font-medium">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
