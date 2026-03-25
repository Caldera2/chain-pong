'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { apiSignup } from '@/lib/api';

const AVATARS = ['🏓', '⚡', '🔥', '💎', '🎯', '👑', '🌀', '🎮', '🤖', '🦊'];

export default function Signup() {
  const { signup, setScreen, referralCode } = useGameStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🏓');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [seedCopied, setSeedCopied] = useState(false);
  const [seedConfirmed, setSeedConfirmed] = useState(false);

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

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Enter a valid email');
    if (!password) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');
    setStep(2);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) return setError('Choose a username');
    if (username.length < 3) return setError('Username must be at least 3 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return setError('Username can only contain letters, numbers, hyphens, and underscores');

    setLoading(true);
    try {
      // All signups go through the backend — it stores email, username, hashed password
      const res = await apiSignup(email, username, password, referralCode || undefined);
      if (res.success && res.data) {
        // Show seed phrase before completing signup
        const data = res.data as any;
        if (data.seedPhrase) {
          setSeedPhrase(data.seedPhrase);
          setStep(3);
        } else {
          // No seed phrase returned — complete signup directly
          signup(data.user.email || email, data.user.username, 'email');
        }
      } else {
        // Backend rejected the signup (duplicate email, duplicate username, etc.)
        setError(res.error || 'Signup failed. Please try again.');
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
            className="w-16 h-16 rounded-full bg-gradient-to-br from-lavender to-coral mx-auto mb-4 flex items-center justify-center shadow-[0_0_30px_rgba(167,139,250,0.4)]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
          >
            <span className="text-2xl">🎮</span>
          </motion.div>
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="text-lavender">Join</span>
            <span className="text-white"> Chain Pong</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm sm:text-base">Create your account and start earning</p>
          {referralCode && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-lavender/10 border border-lavender/20 rounded-full px-3 py-1 text-xs text-lavender">
              <span>👋</span> Referred by <span className="font-semibold">{referralCode}</span>
            </div>
          )}
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[
            { num: 1, label: 'Account' },
            { num: 2, label: 'Profile' },
            { num: 3, label: 'Wallet' },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= s.num
                    ? 'bg-gradient-to-br from-gold to-lavender text-white'
                    : 'bg-white/5 text-gray-600'
                }`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className={`text-[10px] mt-1 ${step >= s.num ? 'text-gray-300' : 'text-gray-600'}`}>{s.label}</span>
              </div>
              {idx < 2 && (
                <div className={`w-12 sm:w-16 h-0.5 rounded transition-all mb-4 ${step > 1 ? 'bg-gold' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Email & Password */}
        {step === 1 && (
          <motion.form
            onSubmit={handleStep1}
            className="glass rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-5"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-lg font-bold text-white">Create your account</h2>

            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-lavender/50 focus:bg-white/[0.07] transition-all text-sm sm:text-base"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-lavender/50 focus:bg-white/[0.07] transition-all text-sm sm:text-base"
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
              <label className="text-sm text-gray-400 mb-1.5 block">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-lavender/50 focus:bg-white/[0.07] transition-all text-sm sm:text-base"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <motion.p
                className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-lavender to-coral py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base hover:shadow-[0_0_20px_rgba(167,139,250,0.4)] transition-shadow"
            >
              Continue
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-gray-500 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/10" />
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
        )}

        {/* Step 2: Username & Avatar */}
        {step === 2 && (
          <motion.form
            onSubmit={handleSignup}
            className="glass rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Set up your profile</h2>
              <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-white">
                ← Back
              </button>
            </div>

            {/* Avatar picker */}
            <div>
              <label className="text-sm text-gray-400 mb-3 block">Choose Avatar</label>
              <div className="flex flex-wrap gap-2 justify-center">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setSelectedAvatar(av)}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl text-2xl flex items-center justify-center transition-all ${
                      selectedAvatar === av
                        ? 'bg-lavender/20 ring-2 ring-lavender scale-110'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a cool username"
                maxLength={20}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 sm:py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-lavender/50 focus:bg-white/[0.07] transition-all text-sm sm:text-base"
              />
              <p className="text-xs text-gray-600 mt-1">{username.length}/20 characters</p>
            </div>

            {/* Preview Card */}
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-lavender to-coral flex items-center justify-center text-xl shrink-0">
                {selectedAvatar}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white text-sm truncate">{username || 'Your Name'}</div>
                <div className="text-xs text-gray-500 truncate">{email}</div>
              </div>
              <div className="ml-auto text-xs text-gray-600 shrink-0">Rank #--</div>
            </div>

            {/* Wallet note */}
            <div className="flex items-start gap-2.5 bg-gold/5 border border-gold/10 rounded-xl p-3">
              <span className="text-base mt-0.5">💡</span>
              <p className="text-xs text-gray-400 leading-relaxed">
                You can connect your <span className="text-gold-light font-medium">Base wallet</span> later from your Profile to withdraw earnings and purchase boards on-chain.
              </p>
            </div>

            {error && (
              <motion.p
                className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-lavender to-coral py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base hover:shadow-[0_0_20px_rgba(167,139,250,0.4)] transition-shadow disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create Account & Play'
              )}
            </button>
          </motion.form>
        )}

        {/* Step 3: Seed Phrase */}
        {step === 3 && (
          <motion.div
            className="glass rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/20 mx-auto mb-3 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" stroke="#f5d060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22V12" stroke="#f5d060" strokeWidth="2"/><path d="M21 7L12 12L3 7" stroke="#f5d060" strokeWidth="2"/></svg>
              </div>
              <h2 className="text-lg font-bold text-white">Your Wallet Seed Phrase</h2>
              <p className="text-xs text-gray-400 mt-1">Write this down and store it safely. This is the ONLY way to recover your wallet.</p>
            </div>

            {/* Warning */}
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
              <span className="text-sm mt-0.5">!!</span>
              <div className="text-xs text-red-400 leading-relaxed">
                <strong>Do NOT share this with anyone.</strong> Anyone with these words can access your wallet and steal your funds. Chain Pong will never ask for your seed phrase.
              </div>
            </div>

            {/* Seed phrase grid */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-2">
                {seedPhrase.split(' ').map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2 py-1.5">
                    <span className="text-[10px] text-gray-600 w-4 text-right">{i + 1}.</span>
                    <span className="text-sm text-white font-mono">{word}</span>
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
              className="w-full py-2.5 rounded-xl text-sm font-medium border border-white/10 text-gray-300 hover:bg-white/5 transition-all"
            >
              {seedCopied ? 'Copied!' : 'Copy to Clipboard'}
            </button>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={seedConfirmed}
                onChange={(e) => setSeedConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-gold"
              />
              <span className="text-xs text-gray-400 leading-relaxed">
                I have saved my seed phrase in a safe place. I understand that if I lose it, I cannot recover my wallet.
              </span>
            </label>

            {/* Continue button */}
            <button
              onClick={() => {
                signup(email, username, 'email');
              }}
              disabled={!seedConfirmed}
              className="w-full bg-gradient-to-r from-gold to-lavender py-3 sm:py-3.5 rounded-xl font-semibold text-white text-sm sm:text-base hover:shadow-[0_0_20px_rgba(212,160,23,0.4)] transition-shadow disabled:opacity-30 disabled:cursor-not-allowed"
            >
              I've Saved It — Enter Game
            </button>
          </motion.div>
        )}

        {/* Login link */}
        <motion.p
          className="text-center mt-6 text-gray-400 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Already have an account?{' '}
          <button
            onClick={() => setScreen('login')}
            className="text-lavender font-semibold hover:underline"
          >
            Log In
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
