'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { apiSignup } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wallet, Loader2, ArrowLeft, Copy, Check, ShieldAlert, User, Lock, Mail } from 'lucide-react';

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
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-primary', 'bg-emerald-500'][passwordStrength];

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
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return setError('Letters, numbers, hyphens and underscores only');

    setLoading(true);
    try {
      const res = await apiSignup(email, username, password, referralCode || undefined);
      if (res.success && res.data) {
        const data = res.data as any;
        if (data.seedPhrase) {
          setSeedPhrase(data.seedPhrase);
          setStep(3);
        } else {
          signup(data.user.email || email, data.user.username, 'email');
        }
      } else {
        setError(res.error || 'Signup failed. Please try again.');
      }
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.03] blur-[120px] rounded-full" />
      </div>

      <motion.div
        className="w-full max-w-sm relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Create Account
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Join ChainPong and start competing</p>
          {referralCode && (
            <Badge variant="outline" className="mt-2 border-primary/30 text-primary">
              Referred by {referralCode}
            </Badge>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                step >= s ? 'w-8 bg-primary' : 'w-4 bg-white/[0.06]'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Email & Password */}
        {step === 1 && (
          <motion.form
            onSubmit={handleStep1}
            className="rounded-xl border border-border bg-card p-6 space-y-4"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
              />
              {password && (
                <div className="pt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-0.5 flex-1 rounded-full transition-all ${i <= passwordStrength ? strengthColor : 'bg-white/[0.06]'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{strengthLabel}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <motion.div
                className="text-destructive text-sm bg-destructive/5 border border-destructive/10 rounded-lg px-3 py-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" className="w-full" size="lg">
              Continue
            </Button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                mounted && (
                  <Button type="button" variant="outline" size="lg" className="w-full" onClick={openConnectModal}>
                    <Wallet className="w-4 h-4" />
                    Continue with Wallet
                  </Button>
                )
              )}
            </ConnectButton.Custom>
          </motion.form>
        )}

        {/* Step 2: Username & Avatar */}
        {step === 2 && (
          <motion.form
            onSubmit={handleSignup}
            className="rounded-xl border border-border bg-card p-6 space-y-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold">Profile Setup</h2>
              <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Avatar</label>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setSelectedAvatar(av)}
                    className={`w-11 h-11 rounded-lg text-xl flex items-center justify-center transition-all ${
                      selectedAvatar === av
                        ? 'bg-primary/10 ring-1.5 ring-primary scale-105'
                        : 'bg-secondary hover:bg-white/[0.06]'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Username</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">{username.length}/20</p>
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-border bg-secondary/50 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                {selectedAvatar}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-foreground text-sm truncate">{username || 'username'}</div>
                <div className="text-xs text-muted-foreground truncate">{email}</div>
              </div>
            </div>

            {error && (
              <motion.div
                className="text-destructive text-sm bg-destructive/5 border border-destructive/10 rounded-lg px-3 py-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
          </motion.form>
        )}

        {/* Step 3: Seed Phrase */}
        {step === 3 && (
          <motion.div
            className="rounded-xl border border-border bg-card p-6 space-y-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mx-auto mb-3 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading text-base font-semibold">Recovery Phrase</h2>
              <p className="text-xs text-muted-foreground mt-1">Save this — it&apos;s the only way to recover your wallet.</p>
            </div>

            <div className="bg-destructive/5 border border-destructive/10 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-destructive text-xs font-medium">Never share these words with anyone.</p>
              </div>
            </div>

            <div className="bg-secondary rounded-lg p-3">
              <div className="grid grid-cols-3 gap-1.5">
                {seedPhrase.split(' ').map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-background/60 rounded-md px-2 py-1.5">
                    <span className="text-[10px] text-muted-foreground w-3 text-right">{i + 1}.</span>
                    <span className="text-foreground text-xs font-mono">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(seedPhrase);
                setSeedCopied(true);
                setTimeout(() => setSeedCopied(false), 3000);
              }}
            >
              {seedCopied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy Phrase</>}
            </Button>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={seedConfirmed}
                onChange={(e) => setSeedConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-border bg-secondary accent-primary"
              />
              <span className="text-muted-foreground text-xs leading-relaxed">
                I saved my recovery phrase and understand it cannot be recovered if lost.
              </span>
            </label>

            <Button
              className="w-full"
              size="lg"
              disabled={!seedConfirmed}
              onClick={() => signup(email, username, 'email')}
            >
              Enter Game
            </Button>
          </motion.div>
        )}

        <p className="text-center mt-5 text-muted-foreground text-sm">
          Already have an account?{' '}
          <button onClick={() => setScreen('login')} className="text-primary font-medium hover:underline">
            Log In
          </button>
        </p>
      </motion.div>
    </div>
  );
}
