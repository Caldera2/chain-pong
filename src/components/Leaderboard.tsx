'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect } from 'react';

export default function Leaderboard() {
  const { leaderboard, setScreen, username, wins, losses, totalEarnings, playerRank, isLoggedIn, fetchLeaderboard } = useGameStore();

  // Fetch from backend on mount
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const hasPlayers = leaderboard.length > 0;

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-6 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" className="text-gold"/></svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Champion&apos;s Board</h1>
          <p className="text-gray-500 text-sm sm:text-base">Ranked by wins — climb to the top</p>
        </motion.div>

        {/* Empty State */}
        {!hasPlayers && (
          <motion.div
            className="glass-elevated rounded-2xl sm:rounded-3xl p-8 sm:p-14 text-center mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/15 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gold/50"/></svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">No Rankings Yet</h2>
            <p className="text-gray-500 text-sm sm:text-base max-w-sm mx-auto mb-6">
              The leaderboard is empty. Be the first player to compete and claim the #1 spot!
            </p>
            <button
              onClick={() => setScreen('mode-select')}
              className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm sm:text-base"
            >
              Play Now
            </button>
          </motion.div>
        )}

        {/* Top 3 Podium — holographic trophies */}
        {leaderboard.length >= 3 && (
          <motion.div
            className="flex items-end justify-center gap-2 sm:gap-4 mb-8 sm:mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, i) => {
              const heights = ['h-24 sm:h-28', 'h-30 sm:h-36', 'h-20 sm:h-24'];
              const positions = ['2nd', '1st', '3rd'];
              const holoClasses = ['holo-silver', 'holo-gold', 'holo-bronze'];
              const borderColors = ['border-gray-400/20', 'border-yellow-500/25', 'border-amber-600/20'];
              const bgColors = ['bg-gray-400/5', 'bg-yellow-500/8', 'bg-amber-600/5'];
              const glowShadows = [
                '0 0 30px rgba(156,163,175,0.05)',
                '0 0 40px rgba(245,208,96,0.1)',
                '0 0 30px rgba(217,119,6,0.05)',
              ];
              const isYou = entry.isPlayer;
              return (
                <div key={entry.rank} className="flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl mb-1 sm:mb-2">{entry.avatar}</span>
                  <span className={`text-xs sm:text-sm font-bold mb-0.5 sm:mb-1 truncate max-w-[70px] sm:max-w-none ${isYou ? 'text-gold-light' : 'text-white'}`}>
                    {entry.username}{isYou ? ' (You)' : ''}
                  </span>
                  <span className="text-[10px] sm:text-xs text-gray-500 mb-1 sm:mb-2">{entry.wins}W / {entry.losses}L</span>
                  <div
                    className={`w-20 sm:w-24 md:w-32 ${heights[i]} rounded-t-xl ${bgColors[i]} ${borderColors[i]} border border-b-0 flex flex-col items-center justify-center ${isYou ? 'ring-2 ring-gold/30' : ''}`}
                    style={{ boxShadow: glowShadows[i] }}
                  >
                    <span className={`text-base sm:text-xl font-bold ${holoClasses[i]}`}>{positions[i]}</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Your Rank Card — pinned with progress */}
        {isLoggedIn && (
          <motion.div
            className="glass-glow-gold rounded-xl sm:rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-light font-bold text-sm sm:text-lg">
                  {hasPlayers ? `#${playerRank}` : '—'}
                </span>
                <div>
                  <div className="font-bold text-white text-sm sm:text-base">{username} <span className="text-gold-light text-xs">(You)</span></div>
                  <div className="text-xs sm:text-sm text-gray-500">{wins}W / {losses}L</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-gold font-bold text-sm sm:text-base">{totalEarnings.toFixed(3)} <span className="text-xs opacity-60">{TOKEN_SYMBOL}</span></div>
                <div className="text-[10px] sm:text-xs text-gray-600">Total earned</div>
              </div>
            </div>
            {/* Progress bar to next tier */}
            {hasPlayers && playerRank > 1 && (
              <div className="mt-3 sm:mt-4">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>Progress to #{playerRank - 1}</span>
                  <span className="text-gold-light font-medium">
                    {playerRank <= 3 ? 'Almost there!' : `${Math.min(Math.round((wins / Math.max(leaderboard[playerRank - 2]?.wins || 1, 1)) * 100), 99)}%`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light relative progress-shimmer"
                    initial={{ width: '0%' }}
                    animate={{ width: `${Math.min((wins / Math.max(leaderboard[playerRank - 2]?.wins || 1, 1)) * 100, 99)}%` }}
                    transition={{ delay: 0.5, duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Full List */}
        {hasPlayers && (
          <motion.div
            className="glass-elevated rounded-xl sm:rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Desktop Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold border-b border-white/5">
              <div className="col-span-1">Rank</div>
              <div className="col-span-4">Player</div>
              <div className="col-span-2 text-center">Wins</div>
              <div className="col-span-2 text-center">Losses</div>
              <div className="col-span-3 text-right">{TOKEN_SYMBOL} Won</div>
            </div>

            {leaderboard.map((entry, i) => {
              const isYou = entry.isPlayer;
              return (
                <motion.div
                  key={`${entry.username}-${entry.rank}`}
                  className={`border-b border-white/[0.03] last:border-0 transition-colors ${isYou ? 'bg-gold/[0.04] hover:bg-gold/[0.07]' : 'hover:bg-white/[0.03]'}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.03 }}
                >
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-4 items-center">
                    <div className="col-span-1">
                      <span className={`text-sm font-bold ${
                        entry.rank === 1 ? 'holo-gold' :
                        entry.rank === 2 ? 'holo-silver' :
                        entry.rank === 3 ? 'holo-bronze' :
                        isYou ? 'text-gold-light' :
                        'text-gray-600'
                      }`}>
                        {entry.rank}
                      </span>
                    </div>
                    <div className="col-span-4 flex items-center gap-2">
                      <span className="text-lg">{entry.avatar}</span>
                      <div>
                        <div className={`font-medium text-sm ${isYou ? 'text-gold-light' : 'text-white'}`}>
                          {entry.username}{isYou ? ' (You)' : ''}
                        </div>
                        <div className="text-[10px] text-gray-700 font-mono">{entry.address}</div>
                      </div>
                    </div>
                    <div className="col-span-2 text-center text-mint font-semibold text-sm">{entry.wins}</div>
                    <div className="col-span-2 text-center text-gray-500 font-medium text-sm">{entry.losses}</div>
                    <div className="col-span-3 text-right text-gold font-semibold text-sm">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</div>
                  </div>

                  {/* Mobile row */}
                  <div className="sm:hidden flex items-center gap-3 px-3 py-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                      entry.rank === 2 ? 'bg-gray-400/8 text-gray-300 border border-gray-400/15' :
                      entry.rank === 3 ? 'bg-amber-600/8 text-amber-500 border border-amber-600/15' :
                      isYou ? 'bg-gold/10 text-gold-light border border-gold/20' :
                      'bg-white/[0.03] text-gray-600 border border-white/5'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="text-lg shrink-0">{entry.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`font-medium text-sm truncate ${isYou ? 'text-gold-light' : 'text-white'}`}>
                        {entry.username}{isYou ? ' (You)' : ''}
                      </div>
                      <div className="text-[10px] text-gray-600">{entry.wins}W / {entry.losses}L</div>
                    </div>
                    <span className="text-gold font-semibold text-xs shrink-0">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-6 sm:mt-8 text-gray-600 hover:text-white transition-colors mx-auto block text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
