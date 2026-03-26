'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const { setScreen, isLoggedIn } = useGameStore();
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!show) {
      const t = setTimeout(() => setScreen(isLoggedIn ? 'lobby' : 'login'), 400);
      return () => clearTimeout(t);
    }
  }, [show, setScreen, isLoggedIn]);

  return (
    <motion.div
      className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50"
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[120px]" />
      </div>

      {/* Logo mark */}
      <motion.div
        className="relative mb-10"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <rect x="1" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
            <rect x="20" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
            <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
          </svg>
        </div>
      </motion.div>

      {/* Title */}
      <motion.h1
        className="font-heading text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <span className="text-primary">Chain</span>
        <span className="text-foreground">Pong</span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        className="text-sm text-muted-foreground mt-3 tracking-[0.2em] uppercase font-medium"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        Play &middot; Earn &middot; Compete
      </motion.p>

      {/* Loading indicator */}
      <motion.div
        className="mt-16 w-32 h-[2px] rounded-full bg-white/[0.06] overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ delay: 0.9, duration: 1.2, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
