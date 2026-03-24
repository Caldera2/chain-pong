'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { apiRequestPasswordReset } from '@/lib/api';

export default function ForgotPassword() {
  const { setScreen } = useGameStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');

    setLoading(true);
    try {
      const res = await apiRequestPasswordReset(email);
      if (res.success) {
        setSent(true);
      } else {
        // Always show success to prevent email enumeration
        setSent(true);
      }
    } catch {
      // Still show success to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
            background: 'radial-gradient(circle at 35% 35%, #fff8e7, #f5d060 50%, #d4a017 100%)',
            boxShadow: '0 0 30px rgba(245,208,96,0.3)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#08090e" strokeWidth="2"/><path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="#08090e" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">
            {sent ? 'Check your email' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {sent ? (
          <motion.div
            className="glass-elevated rounded-2xl p-6 sm:p-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-mint/10 border border-mint/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/></svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Email Sent!</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              If an account exists with <span className="text-white font-medium">{email}</span>, you&apos;ll receive a password reset link shortly.
            </p>
            <button
              onClick={() => setScreen('login')}
              className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm w-full"
            >
              Back to Login
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-elevated rounded-2xl p-6 sm:p-8">
            {error && (
              <div className="mb-4 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-2.5 text-sm text-red-400 text-center">
                {error}
              </div>
            )}

            <div className="mb-6">
              <label className="text-[10px] text-gray-600 mb-2 block uppercase tracking-widest font-semibold">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@example.com"
                className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/40 transition-colors placeholder:text-gray-700"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 rounded-xl font-semibold text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                'Send Reset Link'
              )}
            </button>

            <button
              type="button"
              onClick={() => setScreen('login')}
              className="w-full mt-3 text-gray-600 hover:text-white text-sm transition-colors py-2"
            >
              ← Back to Login
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
