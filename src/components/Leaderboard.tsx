'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

export default function Leaderboard() {
  const { leaderboard, setScreen, username, wins, losses, totalEarnings } = useGameStore();

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold text-white mb-2">Leaderboard</h1>
          <p className="text-gray-400">Top players on the Chain Pong circuit</p>
        </motion.div>

        {/* Top 3 Podium */}
        <motion.div
          className="flex items-end justify-center gap-4 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, i) => {
            const heights = ['h-28', 'h-36', 'h-24'];
            const positions = ['2nd', '1st', '3rd'];
            const colors = ['bg-gray-400/20 border-gray-400/30', 'bg-yellow-500/20 border-yellow-500/30', 'bg-amber-600/20 border-amber-600/30'];
            const textColors = ['text-gray-300', 'text-yellow-400', 'text-amber-500'];
            return (
              <div key={entry.rank} className="flex flex-col items-center">
                <span className="text-3xl mb-2">{entry.avatar}</span>
                <span className="text-sm font-bold text-white mb-1">{entry.username}</span>
                <span className="text-xs text-gray-500 mb-2">{entry.wins}W / {entry.losses}L</span>
                <div className={`w-24 md:w-32 ${heights[i]} rounded-t-xl ${colors[i]} border border-b-0 flex flex-col items-center justify-center`}>
                  <span className={`text-xl font-bold ${textColors[i]}`}>{positions[i]}</span>
                  <span className="text-xs text-gray-400 mt-1">{entry.earnings} ETH</span>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Your Rank */}
        <motion.div
          className="glass rounded-2xl p-5 mb-6 border border-neon-blue/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="w-10 h-10 rounded-full bg-neon-blue/20 flex items-center justify-center text-neon-blue font-bold">
                #42
              </span>
              <div>
                <div className="font-bold text-white">{username} <span className="text-neon-blue text-sm">(You)</span></div>
                <div className="text-sm text-gray-500">{wins}W / {losses}L</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-neon-yellow font-bold">{totalEarnings.toFixed(3)} ETH</div>
              <div className="text-xs text-gray-500">Total earnings</div>
            </div>
          </div>
        </motion.div>

        {/* Full List */}
        <motion.div
          className="glass rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="grid grid-cols-12 gap-2 px-5 py-3 text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
            <div className="col-span-1">Rank</div>
            <div className="col-span-4">Player</div>
            <div className="col-span-2 text-center">Wins</div>
            <div className="col-span-2 text-center">Losses</div>
            <div className="col-span-3 text-right">Earnings</div>
          </div>
          {leaderboard.map((entry, i) => (
            <motion.div
              key={entry.rank}
              className="grid grid-cols-12 gap-2 px-5 py-4 items-center border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.03 }}
            >
              <div className="col-span-1">
                <span className={`font-bold ${
                  entry.rank === 1 ? 'text-yellow-400' :
                  entry.rank === 2 ? 'text-gray-300' :
                  entry.rank === 3 ? 'text-amber-500' :
                  'text-gray-500'
                }`}>
                  {entry.rank}
                </span>
              </div>
              <div className="col-span-4 flex items-center gap-2">
                <span className="text-lg">{entry.avatar}</span>
                <div>
                  <div className="font-medium text-white text-sm">{entry.username}</div>
                  <div className="text-[10px] text-gray-600">{entry.address}</div>
                </div>
              </div>
              <div className="col-span-2 text-center text-neon-green font-medium">{entry.wins}</div>
              <div className="col-span-2 text-center text-neon-pink font-medium">{entry.losses}</div>
              <div className="col-span-3 text-right text-neon-yellow font-medium">{entry.earnings} ETH</div>
            </motion.div>
          ))}
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-8 text-gray-500 hover:text-white transition-colors mx-auto block"
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
