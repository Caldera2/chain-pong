'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

export default function Lobby() {
  const { setScreen, wins, losses, gamesPlayed, totalEarnings, walletBalance, username, leaderboard } = useGameStore();

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Welcome back, <span className="neon-text text-neon-blue">{username}</span>
          </h1>
          <p className="text-gray-400 text-lg">Ready to dominate the table?</p>
        </motion.div>

        {/* Quick stats */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {[
            { label: 'Total Wins', value: wins, color: 'text-neon-green', icon: '🏆' },
            { label: 'Games Played', value: gamesPlayed, color: 'text-neon-blue', icon: '🎮' },
            { label: 'Earnings', value: `${totalEarnings.toFixed(3)} ETH`, color: 'text-neon-yellow', icon: '💰' },
            { label: 'Wallet', value: `${walletBalance.toFixed(4)} ETH`, color: 'text-neon-purple', icon: '💎' },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5 text-center card-shine">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Main Actions */}
        <motion.div
          className="grid md:grid-cols-2 gap-6 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Play Now Card */}
          <button
            onClick={() => setScreen('mode-select')}
            className="group relative overflow-hidden rounded-3xl p-8 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/20 to-neon-purple/20" />
            <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-[1px] rounded-3xl border border-neon-blue/20 group-hover:border-neon-blue/40 transition-colors" />
            <div className="relative">
              <div className="text-5xl mb-4">🎮</div>
              <h2 className="text-3xl font-bold text-white mb-2">Play Now</h2>
              <p className="text-gray-400">Choose PvP or vs Computer and start earning</p>
              <div className="mt-6 inline-flex items-center gap-2 text-neon-blue font-semibold">
                Start Match
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </button>

          {/* Board Shop Card */}
          <button
            onClick={() => setScreen('shop')}
            className="group relative overflow-hidden rounded-3xl p-8 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/20 to-neon-pink/20" />
            <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-[1px] rounded-3xl border border-neon-purple/20 group-hover:border-neon-purple/40 transition-colors" />
            <div className="relative">
              <div className="text-5xl mb-4">🛒</div>
              <h2 className="text-3xl font-bold text-white mb-2">Board Shop</h2>
              <p className="text-gray-400">Collect boards with unique perks to gain an edge</p>
              <div className="mt-6 inline-flex items-center gap-2 text-neon-purple font-semibold">
                Browse Boards
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </button>
        </motion.div>

        {/* Secondary Actions */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setScreen('leaderboard')}
            className="glass glass-hover rounded-2xl p-5 text-center transition-all hover:scale-[1.02]"
          >
            <div className="text-3xl mb-2">🏆</div>
            <div className="font-semibold text-white">Leaderboard</div>
            <div className="text-sm text-gray-500 mt-1">See top players</div>
          </button>
          <button
            onClick={() => setScreen('withdraw')}
            className="glass glass-hover rounded-2xl p-5 text-center transition-all hover:scale-[1.02]"
          >
            <div className="text-3xl mb-2">💸</div>
            <div className="font-semibold text-white">Withdraw</div>
            <div className="text-sm text-gray-500 mt-1">Cash out earnings</div>
          </button>
          <button
            onClick={() => setScreen('profile')}
            className="glass glass-hover rounded-2xl p-5 text-center transition-all hover:scale-[1.02] col-span-2 md:col-span-1"
          >
            <div className="text-3xl mb-2">👤</div>
            <div className="font-semibold text-white">Profile</div>
            <div className="text-sm text-gray-500 mt-1">Stats & settings</div>
          </button>
        </motion.div>

        {/* Mini Leaderboard */}
        <motion.div
          className="glass rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Top Players</h3>
            <button
              onClick={() => setScreen('leaderboard')}
              className="text-sm text-neon-blue hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="space-y-3">
            {leaderboard.slice(0, 5).map((entry) => (
              <div key={entry.rank} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                    entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                    entry.rank === 3 ? 'bg-amber-600/20 text-amber-500' :
                    'bg-white/5 text-gray-500'
                  }`}>
                    {entry.rank}
                  </span>
                  <span className="text-xl">{entry.avatar}</span>
                  <span className="font-medium text-white">{entry.username}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-neon-green">{entry.wins}W</span>
                  <span className="text-neon-yellow">{entry.earnings} ETH</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
