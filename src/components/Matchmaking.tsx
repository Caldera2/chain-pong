'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function Matchmaking() {
  const { setScreen } = useGameStore();
  const [status, setStatus] = useState('Searching for opponent...');
  const [found, setFound] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStatus('Matching skill level...'), 1500);
    const t2 = setTimeout(() => {
      setStatus('Opponent found!');
      setFound(true);
    }, 3000);
    const t3 = setTimeout(() => setScreen('game'), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [setScreen]);

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        {/* Pulsing ring */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-neon-blue/50"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-neon-purple/50"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
          />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 flex items-center justify-center">
            {found ? (
              <motion.span
                className="text-5xl"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring' }}
              >
                ⚔️
              </motion.span>
            ) : (
              <motion.span
                className="text-5xl"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                🔍
              </motion.span>
            )}
          </div>
        </div>

        <motion.h2
          className="text-2xl font-bold text-white mb-2"
          key={status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status}
        </motion.h2>

        {found && (
          <motion.div
            className="mt-4 glass rounded-xl px-6 py-3 inline-flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-2xl">🎯</span>
            <div className="text-left">
              <div className="font-semibold text-white">BaseChamp</div>
              <div className="text-sm text-gray-400">298W / 45L • Rank #2</div>
            </div>
          </motion.div>
        )}

        <motion.p className="text-gray-500 mt-6 text-sm">
          Stake: 0.002 ETH
        </motion.p>

        <button
          onClick={() => setScreen('mode-select')}
          className="mt-4 text-gray-500 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
