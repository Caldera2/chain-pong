'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useMemo } from 'react';
import { apiResetPassword } from '@/lib/api';

interface ResetPasswordProps {
  token: string;
}

export default function ResetPassword({ token }: ResetPasswordProps) {
  const { setScreen } = useGameStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return Math.min(s, 4);
  }, [password]);

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength];
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-gold', 'bg-mint'][passwordStrength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');

    setLoading(true);
    try {
      const res = await apiResetPassword(token, password);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error || 'Failed to reset password. The link may have expired.');
      }
    } catch {
      setError('Could not connect to server. Please try again.');
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="#08090e" strokeWidth="2"/>
              <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="#08090e" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {success ? 'Password Reset!' : 'Create New Password'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {success ? 'You can now log in with your new password' : 'Choose a strong password for your account'}
          </p>
        </div>

        {success ? (
          <motion.div
            className="glass-elevated rounded-2xl p-6 sm:p-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-mint/10 border border-mint/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">All Set!</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Your password has been reset successfully. You can now log in with your new password.
            </p>
            <button
              onClick={() => {
                // Clear the reset token from URL
                if (typeof window !== 'undefined') {
                  window.history.replaceState({}, '', window.location.pathname);
                }
                setScreen('login');
              }}
              className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm w-full"
            >
              Go to Login
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-5">
            {error && (
              <motion.div
                className="bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-2.5 text-sm text-red-400 text-center"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="text-[10px] text-gray-600 mb-2 block uppercase tracking-widest font-semibold">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/40 transition-colors placeholder:text-gray-700"
                autoFocus
                autoComplete="new-password"
              />
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= passwordStrength ? strengthColor : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 ${passwordStrength >= 3 ? 'text-mint' : passwordStrength >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-gray-600 mb-2 block uppercase tracking-widest font-semibold">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/40 transition-colors placeholder:text-gray-700"
                autoComplete="new-password"
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
                  Resetting...
                </span>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
