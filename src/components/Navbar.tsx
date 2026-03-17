'use client';

import { useGameStore } from '@/lib/store';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';

export default function Navbar() {
  const { screen, setScreen, walletBalance, wins, losses } = useGameStore();

  if (screen === 'splash' || screen === 'game') return null;

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-40 glass border-b border-white/5"
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 200 }}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <button onClick={() => setScreen('lobby')} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple group-hover:shadow-[0_0_15px_rgba(0,212,255,0.5)] transition-shadow" />
          <span className="font-bold text-lg tracking-tight">
            <span className="text-neon-blue">CHAIN</span>
            <span className="text-white">PONG</span>
          </span>
        </button>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {[
            { label: 'Play', screen: 'mode-select' as const },
            { label: 'Shop', screen: 'shop' as const },
            { label: 'Leaderboard', screen: 'leaderboard' as const },
            { label: 'Profile', screen: 'profile' as const },
          ].map((item) => (
            <button
              key={item.screen}
              onClick={() => setScreen(item.screen)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                screen === item.screen
                  ? 'text-neon-blue bg-neon-blue/10'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 mr-2 text-sm">
            <span className="text-gray-400">
              <span className="text-neon-green font-semibold">{wins}W</span>
              {' / '}
              <span className="text-neon-pink font-semibold">{losses}L</span>
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-neon-yellow font-semibold">{walletBalance.toFixed(4)} ETH</span>
          </div>
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <button
                  onClick={connected ? openAccountModal : openConnectModal}
                  className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold text-white"
                >
                  {connected ? `${account.displayName}` : 'Connect Wallet'}
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/5 z-50">
        <div className="flex justify-around py-2">
          {[
            { label: '🏠', screen: 'lobby' as const, title: 'Home' },
            { label: '🎮', screen: 'mode-select' as const, title: 'Play' },
            { label: '🛒', screen: 'shop' as const, title: 'Shop' },
            { label: '🏆', screen: 'leaderboard' as const, title: 'Rank' },
            { label: '👤', screen: 'profile' as const, title: 'Profile' },
          ].map((item) => (
            <button
              key={item.screen}
              onClick={() => setScreen(item.screen)}
              className={`flex flex-col items-center px-3 py-1 rounded-lg transition-colors ${
                screen === item.screen ? 'text-neon-blue' : 'text-gray-500'
              }`}
            >
              <span className="text-xl">{item.label}</span>
              <span className="text-[10px] mt-0.5">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.nav>
  );
}
