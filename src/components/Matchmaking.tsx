'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect, useState } from 'react';

export default function Matchmaking() {
  const { setScreen, pvpStakeAmount } = useGameStore();
  const [status, setStatus] = useState('Searching for opponent...');
  const [found, setFound] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStatus('Matching skill level...'), 1500);
    const t2 = setTimeout(() => setStatus('Locking stakes...'), 2500);
    const t3 = setTimeout(() => {
      setStatus('Opponent found!');
      setFound(true);
    }, 3500);
    const t4 = setTimeout(() => setScreen('game'), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [setScreen]);

  const totalPot = pvpStakeAmount * 2;

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <motion.div
        className="text-center max-w-md w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        {/* Scanning ring */}
        <div className="relative w-36 h-36 sm:w-40 sm:h-40 mx-auto mb-8">
          {/* Outer scanner ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: '1px solid rgba(212, 160, 23, 0.15)' }}
            animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: '1px solid rgba(167, 139, 250, 0.15)' }}
            animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.7 }}
          />
          {/* Rotating scan line */}
          {!found && (
            <motion.div
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <div className="absolute top-1/2 left-1/2 w-1/2 h-[1px] bg-gradient-to-r from-gold/60 to-transparent origin-left" />
            </motion.div>
          )}
          {/* Center circle */}
          <div className="absolute inset-3 rounded-full bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/5 flex items-center justify-center">
            {found ? (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14H11V21L20 10H13Z" fill="currentColor" className="text-gold"/></svg>
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" className="text-gold/50"/><path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gold/50"/></svg>
              </motion.div>
            )}
          </div>
          {/* Grid dots */}
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-gold/20"
              style={{
                top: `${50 + 45 * Math.sin((i * Math.PI * 2) / 8)}%`,
                left: `${50 + 45 * Math.cos((i * Math.PI * 2) / 8)}%`,
                transform: 'translate(-50%, -50%)',
              }}
              animate={{ opacity: [0.2, 0.6, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </div>

        <motion.h2
          className="text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight"
          key={status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status}
        </motion.h2>

        {!found && (
          <p className="text-gray-600 text-xs mb-4">Estimated wait: ~3s</p>
        )}

        {found && (
          <motion.div
            className="mt-4 glass-elevated rounded-xl px-5 py-3 inline-flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-10 h-10 rounded-xl bg-coral/10 border border-coral/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" className="text-coral"/><path d="M6 21V19C6 17.3431 7.34315 16 9 16H15C16.6569 16 18 17.3431 18 19V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-coral"/></svg>
            </div>
            <div className="text-left">
              <div className="font-bold text-white text-sm">BaseChamp</div>
              <div className="text-xs text-gray-500">298W / 45L</div>
            </div>
            <div className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-coral/10 text-coral border border-coral/15 font-semibold">
              Matched
            </div>
          </motion.div>
        )}

        {/* Stake Info Box — premium */}
        <motion.div
          className="mt-6 glass-elevated rounded-2xl px-5 py-5 inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-center flex-1">
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5 font-semibold">Your Stake</div>
              <div className="text-coral font-bold text-base">{pvpStakeAmount} <span className="text-xs opacity-60">{TOKEN_SYMBOL}</span></div>
            </div>
            <div className="w-px h-10 bg-white/5" />
            <div className="text-center flex-1">
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5 font-semibold">Opponent</div>
              <div className="text-ice font-bold text-base">{pvpStakeAmount} <span className="text-xs opacity-60">{TOKEN_SYMBOL}</span></div>
            </div>
            <div className="w-px h-10 bg-white/5" />
            <div className="text-center flex-1">
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5 font-semibold">Total Pot</div>
              <div className="text-mint font-bold text-base">{totalPot.toFixed(4)} <span className="text-xs opacity-60">{TOKEN_SYMBOL}</span></div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-gray-600 text-center">
            Winner takes all — loser&apos;s stake is deducted
          </div>
        </motion.div>

        <button
          onClick={() => setScreen('mode-select')}
          className="mt-8 text-gray-600 hover:text-white text-sm transition-colors block mx-auto"
        >
          Cancel Matchmaking
        </button>
      </motion.div>
    </div>
  );
}
