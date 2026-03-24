'use client';

import { useGameStore } from '@/lib/store';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { IS_TESTNET, TOKEN_SYMBOL } from '@/lib/wagmi';

export default function Navbar() {
  const { screen, setScreen, walletBalance, balance, authMethod, isLoggedIn, wins, losses, logout } = useGameStore();
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (screen === 'splash' || screen === 'login' || screen === 'signup' || screen === 'game') return null;

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.04]"
        style={{
          background: 'rgba(6, 8, 16, 0.85)',
          backdropFilter: 'blur(24px)',
        }}
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 200 }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => setScreen('lobby')} className="flex items-center gap-2 group shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full group-hover:shadow-[0_0_15px_rgba(245,208,96,0.3)] transition-shadow" style={{
              background: 'radial-gradient(circle at 35% 35%, #fff8e7, #f5d060 50%, #d4a017 100%)',
            }} />
            <span className="font-bold text-base sm:text-lg tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light to-gold">CHAIN</span>
              <span className="text-white/80">PONG</span>
            </span>
            {IS_TESTNET && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500/60 font-medium ml-0.5 tracking-wider">
                TEST
              </span>
            )}
          </button>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {[
              { label: 'Play', screen: 'mode-select' as const, icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>) },
              { label: 'Shop', screen: 'shop' as const, icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M16 7V5C16 3.89543 15.1046 3 14 3H10C8.89543 3 8 3.89543 8 5V7" stroke="currentColor" strokeWidth="1.5"/></svg>) },
              { label: 'Champions', screen: 'leaderboard' as const, icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/></svg>) },
              { label: 'Profile', screen: 'profile' as const, icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M6 21V19C6 17.34 7.34 16 9 16H15C16.66 16 18 17.34 18 19V21" stroke="currentColor" strokeWidth="1.5"/></svg>) },
            ].map((item) => (
              <button
                key={item.screen}
                onClick={() => setScreen(item.screen)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  screen === item.screen
                    ? 'text-gold bg-gold/8'
                    : 'text-gray-500 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <span className="opacity-60">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn && (
              <div className="hidden lg:flex items-center gap-3 mr-2">
                <div className="flex items-center gap-2 text-xs bg-white/[0.03] rounded-lg px-3 py-1.5 border border-white/5">
                  <span className="text-mint font-semibold">{wins}W</span>
                  <span className="text-gray-700">/</span>
                  <span className="text-coral font-semibold">{losses}L</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs bg-gold/5 rounded-lg px-3 py-1.5 border border-gold/10">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" className="text-gold"/></svg>
                  <span className="text-gold font-bold">{effectiveBalance.toFixed(4)}</span>
                  <span className="text-gold/50">{TOKEN_SYMBOL}</span>
                </div>
              </div>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                      connected
                        ? 'bg-white/[0.04] border border-white/10 text-white hover:bg-white/[0.06]'
                        : 'btn-electric'
                    }`}
                  >
                    {connected ? `${account.displayName}` : 'Connect'}
                  </button>
                );
              }}
            </ConnectButton.Custom>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-white/5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                {mobileMenuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <motion.div
            className="md:hidden border-t border-white/[0.04] px-4 py-3 space-y-1"
            style={{ background: 'rgba(6, 8, 16, 0.95)', backdropFilter: 'blur(32px)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <div className="flex items-center gap-3 text-sm mb-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
              <span className="text-mint font-semibold">{wins}W</span>
              <span className="text-gray-700">/</span>
              <span className="text-coral font-semibold">{losses}L</span>
              <span className="text-gold ml-auto font-bold">{effectiveBalance.toFixed(4)} {TOKEN_SYMBOL}</span>
            </div>
            {[
              { label: 'Play', screen: 'mode-select' as const, icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5,3 19,12 5,21" fill="currentColor" opacity="0.5"/></svg>) },
              { label: 'Shop', screen: 'shop' as const, icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/></svg>) },
              { label: 'Champions', screen: 'leaderboard' as const, icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" opacity="0.5"/></svg>) },
              { label: 'Profile', screen: 'profile' as const, icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/></svg>) },
              { label: 'Claim', screen: 'withdraw' as const, icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></svg>) },
            ].map((item) => (
              <button
                key={item.screen}
                onClick={() => { setScreen(item.screen); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  screen === item.screen
                    ? 'text-gold bg-gold/8'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              onClick={() => { logout(); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400/80 hover:bg-red-400/5 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/><path d="M16 17L21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/></svg>
              Logout
            </button>
          </motion.div>
        )}
      </motion.nav>

      {/* Mobile bottom nav — minimal */}
      {!(['splash', 'login', 'signup', 'game'] as string[]).includes(screen) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom" style={{
          background: 'rgba(6, 8, 16, 0.9)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        }}>
          <div className="flex justify-around py-1.5 sm:py-2">
            {[
              { icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 9L12 2L21 9V20C21 20.55 20.55 21 20 21H4C3.45 21 3 20.55 3 20V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>), screen: 'lobby' as const, title: 'Home' },
              { icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>), screen: 'mode-select' as const, title: 'Play' },
              { icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>), screen: 'shop' as const, title: 'Shop' },
              { icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.5"/></svg>), screen: 'leaderboard' as const, title: 'Rank' },
              { icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M6 21V19C6 17.34 7.34 16 9 16H15C16.66 16 18 17.34 18 19V21" stroke="currentColor" strokeWidth="1.5"/></svg>), screen: 'profile' as const, title: 'Me' },
            ].map((item) => (
              <button
                key={item.screen}
                onClick={() => setScreen(item.screen)}
                className={`flex flex-col items-center px-2 sm:px-3 py-1 rounded-lg transition-colors ${
                  screen === item.screen ? 'text-gold' : 'text-gray-600'
                }`}
              >
                <span className="text-lg sm:text-xl">{item.icon}</span>
                <span className="text-[9px] sm:text-[10px] mt-0.5 font-medium">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
