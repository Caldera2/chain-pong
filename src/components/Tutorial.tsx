'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';

const STEPS = [
  {
    title: 'Stake to Play',
    subtitle: 'Choose your stake. Get matched with an opponent betting the same amount. Winner takes the entire pot.',
    color: '#f5d060',
    icon: (
      <svg viewBox="0 0 120 100" fill="none" className="w-full h-full">
        {/* Two wallets merging into pot */}
        <rect x="10" y="25" width="35" height="30" rx="6" stroke="#10b981" strokeWidth="1.5" fill="rgba(16,185,129,0.08)" />
        <text x="27" y="44" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="bold">0.01</text>
        <rect x="75" y="25" width="35" height="30" rx="6" stroke="#f43f5e" strokeWidth="1.5" fill="rgba(244,63,94,0.08)" />
        <text x="93" y="44" textAnchor="middle" fill="#f43f5e" fontSize="10" fontWeight="bold">0.01</text>
        {/* Arrows */}
        <path d="M48 40L55 40" stroke="#f5d060" strokeWidth="1.5" markerEnd="url(#arrow)" />
        <path d="M72 40L65 40" stroke="#f5d060" strokeWidth="1.5" markerEnd="url(#arrow)" />
        {/* Center pot */}
        <circle cx="60" cy="40" r="8" fill="rgba(245,208,96,0.15)" stroke="#f5d060" strokeWidth="1.5" />
        <text x="60" y="76" textAnchor="middle" fill="#f5d060" fontSize="9" fontWeight="bold">0.02 ETH POT</text>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <path d="M0,0 L6,2 L0,4" fill="#f5d060" />
          </marker>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Swipe to Smash',
    subtitle: 'Move your mouse or drag your finger to control the paddle. Speed and precision are key — outmaneuver your opponent to score.',
    color: '#00d4ff',
    icon: (
      <svg viewBox="0 0 120 100" fill="none" className="w-full h-full">
        {/* Paddle */}
        <rect x="15" y="30" width="10" height="40" rx="5" fill="rgba(0,212,255,0.2)" stroke="#00d4ff" strokeWidth="1.5" />
        {/* Ball with trail */}
        <circle cx="75" cy="50" r="8" fill="rgba(245,208,96,0.3)" stroke="#f5d060" strokeWidth="1.5" />
        <circle cx="60" cy="48" r="5" fill="rgba(245,208,96,0.15)" />
        <circle cx="48" cy="46" r="3" fill="rgba(245,208,96,0.08)" />
        {/* Motion arrow */}
        <path d="M30 50 Q 50 35 70 50" stroke="#00d4ff" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d="M65 47L70 50L65 53" stroke="#00d4ff" strokeWidth="1" fill="none" />
        {/* Hand icon */}
        <path d="M90 70 C90 65 95 62 98 65 L100 70 C103 67 108 68 107 72 L105 80 C104 84 98 86 94 84 L90 78 Z" stroke="#00d4ff" strokeWidth="1" fill="rgba(0,212,255,0.1)" />
        {/* Swipe indicator */}
        <path d="M85 75L105 75" stroke="#00d4ff" strokeWidth="1" strokeDasharray="2 2" />
        <text x="60" y="92" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">LOW LATENCY ON BASE</text>
      </svg>
    ),
  },
  {
    title: 'Win & Level Up',
    subtitle: 'Winnings are sent instantly to your Arena Balance. Earn XP with every match to unlock exclusive table skins, paddle trails, and lower fee tiers.',
    color: '#10b981',
    icon: (
      <svg viewBox="0 0 120 100" fill="none" className="w-full h-full">
        {/* Trophy */}
        <path d="M45 25H75L72 55H48L45 25Z" stroke="#f5d060" strokeWidth="1.5" fill="rgba(245,208,96,0.08)" />
        <rect x="52" y="55" width="16" height="8" rx="2" stroke="#f5d060" strokeWidth="1" fill="rgba(245,208,96,0.05)" />
        <rect x="48" y="63" width="24" height="4" rx="2" stroke="#f5d060" strokeWidth="1" fill="rgba(245,208,96,0.05)" />
        <path d="M45 30H35C33 30 32 32 33 34L38 45C39 47 42 47 43 46" stroke="#f5d060" strokeWidth="1" fill="none" />
        <path d="M75 30H85C87 30 88 32 87 34L82 45C81 47 78 47 77 46" stroke="#f5d060" strokeWidth="1" fill="none" />
        {/* Star inside */}
        <path d="M60 32L62 38L68 38L63 42L65 48L60 44L55 48L57 42L52 38L58 38Z" fill="#f5d060" />
        {/* XP Bar */}
        <rect x="25" y="78" width="70" height="6" rx="3" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <rect x="25" y="78" width="45" height="6" rx="3" fill="rgba(16,185,129,0.3)" />
        <text x="60" y="92" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="7">LEVEL 12 — PRO</text>
      </svg>
    ),
  },
];

export default function Tutorial() {
  const { setScreen } = useGameStore();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Skip button */}
        <motion.button
          onClick={() => setScreen('lobby')}
          className="absolute top-6 right-6 text-xs text-gray-500 hover:text-white transition-colors z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Skip →
        </motion.button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                background: i === step ? current.color : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
          >
            {/* Illustration */}
            <div
              className="w-full h-48 rounded-2xl mb-8 flex items-center justify-center p-6"
              style={{
                background: `radial-gradient(ellipse at 50% 30%, ${current.color}10, transparent 70%)`,
                border: `1px solid ${current.color}15`,
              }}
            >
              {current.icon}
            </div>

            {/* Content */}
            <h2
              className="text-3xl sm:text-4xl font-black text-center mb-3 tracking-tight"
              style={{ color: current.color }}
            >
              {current.title}
            </h2>
            <p className="text-gray-400 text-center text-sm sm:text-base leading-relaxed mb-8 px-2">
              {current.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* CTA Button */}
        <motion.button
          onClick={() => {
            if (isLast) {
              setScreen('lobby');
            } else {
              setStep(step + 1);
            }
          }}
          className="w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all"
          style={{
            background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
            color: '#0a0e1a',
            boxShadow: `0 0 30px ${current.color}30`,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isLast ? 'Start Playing' : step === 0 ? 'Next: Master the Controls' : 'Final Step: Claim Your Winnings'}
        </motion.button>

        {/* Base trust badge on last step */}
        {isLast && (
          <motion.div
            className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Secured on Base Network
          </motion.div>
        )}
      </div>
    </div>
  );
}
