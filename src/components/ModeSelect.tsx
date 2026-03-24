'use client';

import { motion } from 'framer-motion';
import { useGameStore, STAKE_TIERS } from '@/lib/store';
import { TOKEN_SYMBOL, CHAIN_NAME } from '@/lib/wagmi';
import { useState } from 'react';

export default function ModeSelect() {
  const { setScreen, setGameMode, boards, selectedBoard, setSelectedBoard, pvpStakeAmount, setPvpStakeAmount, walletBalance, balance, authMethod } = useGameStore();
  const [showStakeWarning, setShowStakeWarning] = useState('');

  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;

  // Effective balance: wallet users use walletBalance, email users use in-game balance
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  const startGame = () => {
    if (effectiveBalance < pvpStakeAmount) {
      setShowStakeWarning(`Insufficient balance! You need at least ${pvpStakeAmount} ${TOKEN_SYMBOL} to stake. Your balance: ${effectiveBalance.toFixed(4)} ${TOKEN_SYMBOL}`);
      return;
    }
    setShowStakeWarning('');
    setGameMode('pvp');
    setScreen('matchmaking');
  };

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 sm:mb-2 text-center tracking-tight">Choose Your Mode</h1>
          <p className="text-gray-500 text-center mb-2 text-sm sm:text-base">Select how you want to play</p>
          <div className="flex items-center justify-center gap-2 mb-6 sm:mb-10">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-gray-500 border border-white/5 font-medium tracking-wider uppercase">
              {CHAIN_NAME}
            </span>
          </div>
        </motion.div>

        {/* Game Mode Card — PvP Only */}
        <div className="max-w-lg mx-auto mb-6 sm:mb-10">
          <motion.div
            onClick={() => startGame()}
            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left cursor-pointer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            role="button"
            tabIndex={0}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-coral/12 via-coral/5 to-transparent" />
            <div className="absolute inset-[1px] rounded-3xl border border-coral/15 group-hover:border-coral/40 transition-colors" />
            {/* Decorative lightning */}
            <div className="absolute top-4 right-4 w-20 h-20 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg viewBox="0 0 80 80" fill="none"><path d="M40 10L25 40H38L32 70L55 35H42L48 10H40Z" stroke="currentColor" strokeWidth="0.5" className="text-coral"/></svg>
            </div>
            <div className="relative">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-coral/10 border border-coral/20 flex items-center justify-center mb-3 sm:mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14H11V21L20 10H13Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-coral"/></svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2 tracking-tight">PvP Match</h2>
              <p className="text-gray-400 mb-3 sm:mb-4 text-sm sm:text-base">Challenge real players — winner takes the pot</p>
              <div className="flex items-center gap-2 text-coral font-medium text-sm">
                <span className="w-2 h-2 rounded-full bg-coral online-dot" />
                <span>2,847 Online</span>
              </div>

              {/* Stake Amount Selector — 3D card grid */}
              <div className="mt-5 sm:mt-6" onClick={(e) => e.stopPropagation()}>
                <div className="text-[10px] text-gray-500 mb-2 font-semibold uppercase tracking-widest">Stake Amount</div>
                <div className="grid grid-cols-3 gap-2">
                  {STAKE_TIERS.map((tier) => (
                    <button
                      key={tier}
                      onClick={(e) => { e.stopPropagation(); setPvpStakeAmount(tier); setShowStakeWarning(''); }}
                      className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        pvpStakeAmount === tier
                          ? 'bg-gradient-to-b from-coral/20 to-coral/5 text-coral border border-coral/40 shadow-[0_0_15px_rgba(251,113,133,0.15)] scale-105'
                          : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:border-white/15 hover:text-gray-300'
                      }`}
                    >
                      {tier} {TOKEN_SYMBOL}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    Both stake <span className="text-white font-semibold">{pvpStakeAmount} {TOKEN_SYMBOL}</span>
                  </span>
                  <span className="text-mint font-bold">
                    Winner: {(pvpStakeAmount * 2).toFixed(4)} {TOKEN_SYMBOL}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-gray-700">
                  Loser&apos;s stake is transferred to the winner
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stake Warning */}
        {showStakeWarning && (
          <motion.div
            className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {showStakeWarning}
          </motion.div>
        )}

        {/* Your Balance Bar — premium */}
        <motion.div
          className="glass-elevated rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/15 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="1.5" className="text-gold"/></svg>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Your Balance</div>
              <div className="text-sm font-bold text-white">{effectiveBalance.toFixed(4)} <span className="text-gold text-xs">{TOKEN_SYMBOL}</span></div>
            </div>
          </div>
          <button
            onClick={() => setScreen('deposit')}
            className="text-[10px] text-gold-light hover:text-gold transition-colors bg-gold/5 px-3 py-1.5 rounded-lg border border-gold/10 font-semibold uppercase tracking-wider"
          >
            Deposit
          </button>
        </motion.div>

        {/* Board Selector */}
        <motion.div
          className="glass-elevated rounded-2xl p-5 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Select Board</h3>
            <button
              onClick={() => setScreen('shop')}
              className="text-[10px] text-gold-light hover:text-gold transition-colors bg-gold/5 px-3 py-1.5 rounded-lg border border-gold/10 font-semibold uppercase tracking-wider"
            >
              Get More
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ownedBoards.map((board) => {
              const isSelected = selectedBoard === board.id;
              const rarityColors: Record<string, string> = {
                common: '#9ca3af',
                rare: '#38bdf8',
                epic: '#a855f7',
                legendary: '#f59e0b',
              };
              const rarityColor = rarityColors[board.rarity] || '#9ca3af';
              return (
                <motion.button
                  key={board.id}
                  onClick={() => setSelectedBoard(board.id)}
                  className={`relative group rounded-xl p-3.5 text-left transition-all overflow-hidden ${
                    isSelected
                      ? 'bg-white/[0.06] border border-transparent'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/15'
                  }`}
                  style={{
                    borderColor: isSelected ? board.color : undefined,
                    outline: isSelected ? `1px solid ${board.color}` : undefined,
                    boxShadow: isSelected ? `0 0 20px ${board.color}20, inset 0 0 30px ${board.color}08` : undefined,
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {/* Glow effect for selected */}
                  {isSelected && (
                    <div
                      className="absolute inset-0 opacity-10 rounded-xl"
                      style={{ background: `radial-gradient(ellipse at 50% 0%, ${board.color}, transparent 70%)` }}
                    />
                  )}
                  <div className="relative">
                    {/* Rarity badge */}
                    <div className="flex items-center justify-between mb-2.5">
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{ color: rarityColor, background: `${rarityColor}15` }}
                      >
                        {board.rarity}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full" style={{ background: board.color, boxShadow: `0 0 6px ${board.color}` }} />
                      )}
                    </div>
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-2.5 text-xl"
                      style={{ background: `${board.color}12`, border: `1px solid ${board.color}25` }}
                    >
                      {board.perkIcon}
                    </div>
                    {/* Name */}
                    <div className="text-sm font-semibold text-white mb-0.5 truncate">{board.name}</div>
                    {/* Perk */}
                    <div className="text-[11px] text-gray-500 truncate">
                      {board.perk === 'None' ? 'No perk' : board.perk}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Selected board detail */}
          {currentBoard && (
            <motion.div
              key={currentBoard.id}
              className="mt-4 rounded-xl p-3.5 flex items-start gap-3"
              style={{ background: `${currentBoard.color}08`, border: `1px solid ${currentBoard.color}15` }}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-lg"
                style={{ background: `${currentBoard.color}15` }}
              >
                {currentBoard.perkIcon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{currentBoard.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {currentBoard.perk === 'None'
                    ? 'Pure skill — no special abilities'
                    : `${currentBoard.perk} — ${currentBoard.perkDescription}`}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-6 text-gray-600 hover:text-white transition-colors mx-auto block text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
