'use client';

import { motion } from 'framer-motion';
import { useGameStore, Board } from '@/lib/store';

const rarityColors = {
  common: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
  rare: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  epic: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  legendary: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
};

function BoardCard({ board, onBuy, canAfford }: { board: Board; onBuy: () => void; canAfford: boolean }) {
  return (
    <motion.div
      className="glass rounded-2xl overflow-hidden card-shine group"
      whileHover={{ y: -5, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      {/* Board Preview */}
      <div
        className="h-40 relative flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${board.color}15, ${board.color}05)` }}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `radial-gradient(circle at center, ${board.color}20, transparent)` }}
        />
        <span className="text-6xl">{board.perkIcon}</span>

        {/* Rarity badge */}
        <span className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${rarityColors[board.rarity]}`}>
          {board.rarity}
        </span>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-white mb-1">{board.name}</h3>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium" style={{ color: board.color }}>
            {board.perk}
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-4 leading-relaxed">{board.perkDescription}</p>

        {board.owned ? (
          <div className="w-full py-2.5 rounded-xl bg-neon-green/10 text-neon-green text-center font-semibold text-sm border border-neon-green/20">
            ✓ Owned
          </div>
        ) : (
          <button
            onClick={onBuy}
            disabled={!canAfford}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
              canAfford
                ? 'btn-primary text-white hover:scale-[1.02]'
                : 'bg-white/5 text-gray-600 cursor-not-allowed'
            }`}
          >
            {canAfford ? `Buy for ${board.price} ETH` : `${board.price} ETH (Insufficient)`}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function Shop() {
  const { boards, buyBoard, balance, setScreen } = useGameStore();

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold text-white mb-2">Board Shop</h1>
          <p className="text-gray-400">Each board comes with a unique perk to give you an edge</p>
          <div className="mt-3 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
            <span className="text-gray-400">Balance:</span>
            <span className="text-neon-yellow font-bold">{balance.toFixed(4)} ETH</span>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="flex flex-wrap gap-2 justify-center mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {['All', 'Common', 'Rare', 'Epic', 'Legendary'].map((filter) => (
            <button
              key={filter}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all border border-transparent hover:border-white/10"
            >
              {filter}
            </button>
          ))}
        </motion.div>

        {/* Board Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {boards.map((board, i) => (
            <motion.div
              key={board.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <BoardCard
                board={board}
                onBuy={() => buyBoard(board.id)}
                canAfford={balance >= board.price}
              />
            </motion.div>
          ))}
        </div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-10 text-gray-500 hover:text-white transition-colors mx-auto block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
