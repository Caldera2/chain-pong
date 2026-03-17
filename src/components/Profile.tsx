'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';

export default function Profile() {
  const { username, setUsername, wins, losses, gamesPlayed, totalEarnings, walletBalance, balance, boards, selectedBoard, setScreen } = useGameStore();
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(username);
  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Profile Header */}
          <div className="glass rounded-3xl p-8 mb-6 text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple mx-auto mb-4 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(0,212,255,0.3)]">
              🏓
            </div>
            {editing ? (
              <div className="flex items-center justify-center gap-2 mb-2">
                <input
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-center text-white focus:outline-none focus:border-neon-blue"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setUsername(tempName);
                      setEditing(false);
                    }
                  }}
                />
                <button
                  onClick={() => { setUsername(tempName); setEditing(false); }}
                  className="text-neon-green hover:underline text-sm"
                >
                  Save
                </button>
              </div>
            ) : (
              <h2 className="text-2xl font-bold text-white mb-1">
                {username}
                <button onClick={() => setEditing(true)} className="ml-2 text-gray-500 hover:text-white text-sm">
                  ✏️
                </button>
              </h2>
            )}
            <p className="text-gray-500 text-sm">Rank #42 • Joined March 2026</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Wins', value: wins, color: 'text-neon-green' },
              { label: 'Total Losses', value: losses, color: 'text-neon-pink' },
              { label: 'Games Played', value: gamesPlayed, color: 'text-neon-blue' },
              { label: 'Earnings', value: `${totalEarnings.toFixed(3)}`, color: 'text-neon-yellow' },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Current Board */}
          <div className="glass rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4">Active Board</h3>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl"
                style={{ background: `${currentBoard.color}20` }}
              >
                {currentBoard.perkIcon}
              </div>
              <div>
                <div className="font-bold text-white">{currentBoard.name}</div>
                <div className="text-sm" style={{ color: currentBoard.color }}>{currentBoard.perk}</div>
                <div className="text-xs text-gray-500 mt-0.5">{currentBoard.perkDescription}</div>
              </div>
            </div>
          </div>

          {/* Owned Boards */}
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">My Boards ({ownedBoards.length}/{boards.length})</h3>
              <button onClick={() => setScreen('shop')} className="text-sm text-neon-blue hover:underline">
                Get More →
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {boards.map((board) => (
                <div
                  key={board.id}
                  className={`rounded-xl p-3 text-center transition-all ${
                    board.owned ? 'glass' : 'bg-white/[0.02] opacity-40'
                  }`}
                >
                  <div className="text-2xl mb-1">{board.perkIcon}</div>
                  <div className="text-xs font-medium text-white">{board.name}</div>
                  {!board.owned && <div className="text-[10px] text-gray-600 mt-0.5">🔒</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Wallet */}
          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Wallet</h3>
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400">Balance</span>
              <span className="text-neon-yellow font-bold text-xl">{walletBalance.toFixed(4)} ETH</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setScreen('withdraw')}
                className="flex-1 btn-primary py-3 rounded-xl font-semibold text-white text-sm"
              >
                Withdraw
              </button>
              <button className="flex-1 btn-secondary py-3 rounded-xl font-semibold text-white text-sm">
                Deposit
              </button>
            </div>
          </div>
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-8 text-gray-500 hover:text-white transition-colors mx-auto block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
