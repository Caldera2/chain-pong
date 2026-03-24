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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) return setError('Email is required');
    if (!password.trim()) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    try {
      // All logins go through the backend — it verifies the hashed password
      // and returns the saved username from the database
      const res = await apiLogin(email, password);
      if (res.success && res.data) {
        // Backend verified credentials — use the username stored in the database
        const user = res.data.user;
        login(user.email || email, user.username, 'email');
      } else {
        // Backend rejected login (wrong email/password, banned, etc.)
        setError(res.error || 'Invalid email or password');
      }
    } catch (err: any) {
      setError('Could not connect to server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

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
