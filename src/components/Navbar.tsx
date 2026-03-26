'use client';

import { useGameStore } from '@/lib/store';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { IS_TESTNET, TOKEN_SYMBOL } from '@/lib/wagmi';
import { Badge } from '@/components/ui/badge';
import { Home, Gamepad2, ShoppingBag, Trophy, User, LogOut, Menu, X, ArrowUpRight } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Play', screen: 'mode-select' as const, icon: Gamepad2 },
  { label: 'Shop', screen: 'shop' as const, icon: ShoppingBag },
  { label: 'Ranking', screen: 'leaderboard' as const, icon: Trophy },
  { label: 'Profile', screen: 'profile' as const, icon: User },
] as const;

const MOBILE_ITEMS = [
  { label: 'Home', screen: 'lobby' as const, icon: Home },
  { label: 'Play', screen: 'mode-select' as const, icon: Gamepad2 },
  { label: 'Shop', screen: 'shop' as const, icon: ShoppingBag },
  { label: 'Rank', screen: 'leaderboard' as const, icon: Trophy },
  { label: 'Me', screen: 'profile' as const, icon: User },
] as const;

export default function Navbar() {
  const { screen, setScreen, walletBalance, balance, authMethod, isLoggedIn, wins, losses, logout } = useGameStore();
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const hidden = ['splash', 'login', 'signup', 'game', 'forgot-password'].includes(screen);
  if (hidden) return null;

  return (
    <>
      {/* Desktop top nav */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl"
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => setScreen('lobby')} className="flex items-center gap-2 group shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                <rect x="1" y="7" width="2.5" height="10" rx="1.25" fill="currentColor" />
                <rect x="20.5" y="7" width="2.5" height="10" rx="1.25" fill="currentColor" />
              </svg>
            </div>
            <span className="font-heading font-bold text-base tracking-tight">
              <span className="text-primary">Chain</span>
              <span className="text-foreground">Pong</span>
            </span>
            {IS_TESTNET && <Badge variant="outline" className="text-[9px] px-1.5 border-yellow-500/30 text-yellow-500">Testnet</Badge>}
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = screen === item.screen;
              return (
                <button
                  key={item.screen}
                  onClick={() => setScreen(item.screen)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'text-primary bg-primary/[0.08]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <div className="hidden lg:flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 border border-border">
                  <span className="text-emerald-400 font-medium">{wins}W</span>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="text-red-400 font-medium">{losses}L</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border border-primary/15 bg-primary/[0.04]">
                  <span className="text-primary font-semibold">{effectiveBalance.toFixed(4)}</span>
                  <span className="text-primary/40">{TOKEN_SYMBOL}</span>
                </div>
              </div>
            )}

            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      connected
                        ? 'border border-border text-foreground hover:bg-white/[0.04]'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {connected ? account.displayName : 'Connect'}
                  </button>
                );
              }}
            </ConnectButton.Custom>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-white/[0.04] text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {isLoggedIn && (
                <div className="flex items-center gap-3 text-sm mb-2 px-3 py-2 rounded-lg border border-border">
                  <span className="text-emerald-400 font-medium text-xs">{wins}W</span>
                  <span className="text-muted-foreground/20">/</span>
                  <span className="text-red-400 font-medium text-xs">{losses}L</span>
                  <span className="text-primary ml-auto font-semibold text-xs">{effectiveBalance.toFixed(4)} {TOKEN_SYMBOL}</span>
                </div>
              )}
              {[
                ...NAV_ITEMS,
                { label: 'Claim', screen: 'withdraw' as const, icon: ArrowUpRight },
              ].map((item) => {
                const Icon = item.icon;
                const active = screen === item.screen;
                return (
                  <button
                    key={item.screen}
                    onClick={() => { setScreen(item.screen); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'text-primary bg-primary/[0.08]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive/70 hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Mobile bottom tab bar */}
      {!hidden && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom bg-background/90 backdrop-blur-xl border-t border-border">
          <div className="flex justify-around py-1.5">
            {MOBILE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = screen === item.screen;
              return (
                <button
                  key={item.screen}
                  onClick={() => setScreen(item.screen)}
                  className={`flex flex-col items-center px-3 py-1 rounded-md transition-colors ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
