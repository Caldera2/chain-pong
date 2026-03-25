'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { apiLogin } from '@/lib/api';

export default function Login() {
  const { login, setScreen } = useGameStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Wallet migration state (for old users getting a new real wallet)
  const [seedPhrase, setSeedPhrase] = useState('');
  const [seedCopied, setSeedCopied] = useState(false);
  const [seedConfirmed, setSeedConfirmed] = useState(false);
  const [pendingUser, setPendingUser] = useState<{ email: string; username: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) return setError('Email is required');
    if (!password.trim()) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    try {
      const res = await apiLogin(email, password);
      if (res.success && res.data) {
        const data = res.data as any;
        const user = data.user;

        // If wallet was migrated, show seed phrase first
        if (data.seedPhrase && data.walletMigrated) {
          setSeedPhrase(data.seedPhrase);
          setPendingUser({ email: user.email || email, username: user.username });
        } else {
          login(user.email || email, user.username, 'email');
        }
      } else {
        setError(res.error || 'Invalid email or password');
      }
    } catch (err: any) {
      setError('Could not connect to server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Seed phrase migration screen
  if (seedPhrase && pendingUser) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center px-4 py-8">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="glass rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-5">
            {/* Header */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center bg-gradient-to-br from-gold/20 to-lavender/20 border border-gold/30">
                <span className="text-2xl">🔑</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Wallet Upgraded</h2>
              <p className="text-gray-400 text-sm">
                Your game wallet has been upgraded to a real wallet. Save your recovery phrase — it&apos;s the <span className="text-coral font-medium">only way</span> to recover your wallet.
              </p>
            </div>

            {/* Warning banner */}
            <div className="bg-coral/10 border border-coral/20 rounded-xl p-3">
              <p className="text-coral text-xs font-medium text-center">
                Write these words down and store them safely. Never share them with anyone.
              </p>
            </div>

            {/* Seed phrase grid */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-2">
                {seedPhrase.split(' ').map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <span className="text-[10px] text-gray-600 w-4 text-right">{i + 1}.</span>
                    <span className="text-white text-xs font-mono">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Copy button */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(seedPhrase);
                setSeedCopied(true);
                setTimeout(() => setSeedCopied(false), 3000);
              }}
              className="w-full bg-white/[0.05] border border-white/10 py-2.5 rounded-xl text-sm font-medium text-white hover:bg-white/[0.08] transition-colors"
            >
              {seedCopied ? '✓ Copied to Clipboard' : 'Copy Recovery Phrase'}
            </button>

            {/* Confirm checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={seedConfirmed}
                onChange={(e) => setSeedConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-white/5 accent-gold"
              />
              <span className="text-gray-400 text-xs leading-relaxed">
                I have saved my recovery phrase and understand that if I lose it, I cannot recover my wallet.
              </span>
            </label>

            {/* Continue button */}
            <button
              onClick={() => {
                login(pendingUser.email, pendingUser.username, 'email');
              }}
              disabled={!seedConfirmed}
              className="w-full bg-gradient-to-r from-gold to-lavender py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base hover:shadow-[0_0_20px_rgba(212,160,23,0.4)] transition-shadow disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue to Game
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4 py-8">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #fff8e7, #f5d060 40%, #d4a017 70%, #a67c00 100%)',
              boxShadow: '0 0 30px rgba(245,208,96,0.4)',
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
          >
            <span className="text-2xl">🏓</span>
          </motion.div>
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light to-gold">CHAIN</span>
            <span className="text-white/90"> PONG</span>
          </h1>

        </div>

        {/* Login Form */}
        <motion.form
          onSubmit={handleLogin}
          className="glass rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="player@example.com"
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-gold/40 focus:bg-white/[0.05] transition-all text-sm sm:text-base"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-gold/40 focus:bg-white/[0.05] transition-all text-sm sm:text-base"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <motion.p
              className="text-coral text-sm bg-coral/10 rounded-lg px-3 py-2"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input type="checkbox" className="rounded border-white/20 bg-white/5 accent-gold" />
              Remember me
            </label>
            <button type="button" onClick={() => setScreen('forgot-password')} className="text-gold hover:underline">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 sm:py-3.5 rounded-xl font-semibold text-sm sm:text-base disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Logging in...
              </span>
            ) : (
              'Log In'
            )}
          </button>
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-gray-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Continue with Wallet */}
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              mounted && (
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="w-full btn-secondary py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base flex items-center justify-center gap-2.5"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
                    <path d="M16 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
                    <path d="M6 6V5a3 3 0 013-3h6a3 3 0 013 3v1" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Continue with Wallet
                </button>
              )
            )}
          </ConnectButton.Custom>
        </motion.form>

        {/* Sign up link */}
        <motion.p
          className="text-center mt-6 text-gray-500 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Don&apos;t have an account?{' '}
          <button
            onClick={() => setScreen('signup')}
            className="text-gold font-semibold hover:underline"
          >
            Sign Up
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
