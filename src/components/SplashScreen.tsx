'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useEffect, useMemo, useState } from 'react';

export default function SplashScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [show, setShow] = useState(true);

  const particles = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        x: (i * 53 + 17) % 100,
        y: (i * 37 + 11) % 100,
        drift: -((i * 29 + 7) % 200),
        dur: 2 + (i % 4),
        delay: (i * 0.1) % 2,
      })),
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!show) {
      const t = setTimeout(() => setScreen('lobby'), 500);
      return () => clearTimeout(t);
    }
  }, [show, setScreen]);

  return (
    <motion.div
      className="fixed inset-0 gradient-bg flex flex-col items-center justify-center z-50"
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-neon-blue/30"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            animate={{
              y: [0, p.drift],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: p.dur,
              repeat: Infinity,
              delay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Ball animation */}
      <motion.div
        className="relative mb-8"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1, delay: 0.2 }}
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple shadow-[0_0_30px_rgba(0,212,255,0.5),0_0_60px_rgba(168,85,247,0.3)]" />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-neon-blue/50"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        className="text-6xl md:text-8xl font-bold tracking-tighter"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink">
          CHAIN
        </span>
        <span className="text-white ml-3">PONG</span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        className="text-lg text-gray-400 mt-4 tracking-widest uppercase"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        Play • Earn • Dominate on Base
      </motion.p>

      {/* Loading bar */}
      <motion.div
        className="mt-12 w-48 h-1 rounded-full bg-white/10 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ delay: 1.2, duration: 1.5, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
