'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useEffect, useMemo, useState } from 'react';

export default function SplashScreen() {
  const { setScreen, isLoggedIn } = useGameStore();
  const [show, setShow] = useState(true);

  const particles = useMemo(
    () =>
      Array.from({ length: 25 }).map((_, i) => ({
        x: (i * 53 + 17) % 100,
        y: (i * 37 + 11) % 100,
        drift: -((i * 29 + 7) % 200),
        dur: 2 + (i % 4),
        delay: (i * 0.1) % 2,
        color: i % 3 === 0 ? 'bg-gold/30' : i % 3 === 1 ? 'bg-mint/20' : 'bg-lavender/20',
      })),
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!show) {
      const t = setTimeout(() => setScreen(isLoggedIn ? 'lobby' : 'login'), 500);
      return () => clearTimeout(t);
    }
  }, [show, setScreen, isLoggedIn]);

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
            className={`absolute w-1 h-1 rounded-full ${p.color}`}
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

      {/* Ping pong ball - realistic */}
      <motion.div
        className="relative mb-8"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1, delay: 0.2 }}
      >
        <div className="w-24 h-24 rounded-full relative" style={{
          background: 'radial-gradient(circle at 35% 35%, #fff8e7, #f5d060 40%, #d4a017 70%, #a67c00 100%)',
          boxShadow: '0 0 40px rgba(245,208,96,0.4), 0 0 80px rgba(212,160,23,0.2), inset 0 -4px 8px rgba(0,0,0,0.2)',
        }}>
          {/* Highlight */}
          <div className="absolute top-3 left-4 w-6 h-4 rounded-full bg-white/40 blur-[2px]" />
          {/* Seam line */}
          <div className="absolute inset-0 rounded-full" style={{
            border: '1.5px dashed rgba(166,124,0,0.4)',
            transform: 'rotate(-20deg)',
          }} />
        </div>
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: '2px solid rgba(245,208,96,0.3)' }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
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
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold to-neon-orange">
          CHAIN
        </span>
        <span className="text-white/90 ml-3">PONG</span>
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
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #d4a017, #f5d060, #10b981)' }}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ delay: 1.2, duration: 1.5, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
