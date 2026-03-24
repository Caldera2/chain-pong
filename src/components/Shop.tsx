'use client';

import { motion } from 'framer-motion';
import { useGameStore, Board } from '@/lib/store';
import { IS_TESTNET, CHAIN_NAME, TOKEN_SYMBOL } from '@/lib/wagmi';
import { useState } from 'react';

const rarityColors: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  common: { text: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/20', glow: '' },
  rare: { text: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]' },
  epic: { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.1)]' },
  legendary: { text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', glow: 'shadow-[0_0_20px_rgba(234,179,8,0.1)]' },
};

const rarityOrder = ['common', 'rare', 'epic', 'legendary'];

function BoardCard({ board, onBuy, canAfford }: { board: Board; onBuy: () => void; canAfford: boolean }) {
  const rc = rarityColors[board.rarity];

  return (
    <motion.div
      className={`glass rounded-2xl overflow-hidden card-shine group flex flex-col ${rc.glow}`}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      {/* Board Preview — fixed height */}
      <div
        className="h-36 sm:h-40 relative flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(135deg, ${board.color}12, ${board.color}05)` }}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `radial-gradient(circle at center, ${board.color}15, transparent)` }}
        />
        <span className="text-5xl sm:text-6xl">{board.perkIcon}</span>

        {/* Rarity badge */}
        <span className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${rc.text} ${rc.bg} ${rc.border}`}>
          {board.rarity}
        </span>

        {/* Owned badge */}
        {board.owned && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-mint/30 bg-mint/10 text-mint">
            Owned
          </span>
        )}
      </div>

      {/* Info — flex-grow to equalize */}
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <h3 className="text-base sm:text-lg font-bold text-white mb-1">{board.name}</h3>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs sm:text-sm font-medium" style={{ color: board.color }}>
            {board.perk}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mb-4 leading-relaxed flex-1">{board.perkDescription}</p>

        {/* Price & Action */}
        {board.owned ? (
          <div className="w-full py-2.5 rounded-xl bg-mint/8 text-mint text-center font-semibold text-sm border border-mint/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline mr-1.5 -mt-0.5"><path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Owned
          </div>
        ) : board.price === 0 ? (
          <div className="w-full py-2.5 rounded-xl bg-white/5 text-gray-400 text-center font-semibold text-sm border border-white/5">
            Free
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Price</span>
              <span className={`text-sm font-bold ${canAfford ? 'text-gold' : 'text-red-400/70'}`}>
                {board.price} {TOKEN_SYMBOL}
              </span>
            </div>
            <button
              onClick={onBuy}
              disabled={!canAfford}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                canAfford
                  ? 'btn-primary hover:scale-[1.02]'
                  : 'bg-red-500/5 text-red-400/60 cursor-not-allowed border border-red-500/10'
              }`}
            >
              {canAfford ? (
                <>Buy for {board.price} {TOKEN_SYMBOL}</>
              ) : (
                <>Insufficient Funds</>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Shop() {
  const { boards, buyBoard, balance, walletBalance, authMethod, setScreen } = useGameStore();
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  // Filter boards by rarity
  const filteredBoards = activeFilter === 'all'
    ? boards
    : boards.filter((b) => b.rarity === activeFilter);

  // Count per rarity
  const countByRarity = {
    all: boards.length,
    common: boards.filter(b => b.rarity === 'common').length,
    rare: boards.filter(b => b.rarity === 'rare').length,
    epic: boards.filter(b => b.rarity === 'epic').length,
    legendary: boards.filter(b => b.rarity === 'legendary').length,
  };

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-6 sm:mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 sm:mb-2 tracking-tight">Skill Shop</h1>
          <p className="text-gray-500 text-sm sm:text-base">Each board comes with a unique perk to give you an edge</p>
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 glass-elevated rounded-full px-4 py-1.5 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" className="text-gold"/></svg>
              <span className="text-gray-500">Balance:</span>
              <span className="text-gold font-bold">{effectiveBalance.toFixed(4)} {TOKEN_SYMBOL}</span>
            </div>
            {IS_TESTNET && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-500/8 text-yellow-500/60 border border-yellow-500/15 font-medium tracking-wider uppercase">
                {CHAIN_NAME}
              </span>
            )}
          </div>
        </motion.div>

        {/* Rarity Filters */}
        <motion.div
          className="flex flex-wrap gap-2 justify-center mb-6 sm:mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {[
            { key: 'all', label: 'All', color: 'text-white' },
            { key: 'common', label: 'Common', color: 'text-gray-400' },
            { key: 'rare', label: 'Rare', color: 'text-blue-400' },
            { key: 'epic', label: 'Epic', color: 'text-purple-400' },
            { key: 'legendary', label: 'Legendary', color: 'text-yellow-400' },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activeFilter === filter.key
                  ? `${filter.color} bg-white/8 border-white/15`
                  : 'text-gray-600 bg-white/[0.02] border-white/5 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              {filter.label}
              <span className="ml-1.5 text-[10px] opacity-50">{countByRarity[filter.key as keyof typeof countByRarity]}</span>
            </button>
          ))}
        </motion.div>

        {/* Board Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {filteredBoards.map((board, i) => (
            <motion.div
              key={board.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <BoardCard
                board={board}
                onBuy={() => buyBoard(board.id)}
                canAfford={effectiveBalance >= board.price}
              />
            </motion.div>
          ))}
        </div>

        {filteredBoards.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-sm">No boards in this category</p>
          </div>
        )}

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-10 text-gray-600 hover:text-white transition-colors mx-auto block text-sm"
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
