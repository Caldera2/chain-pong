'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { markWalletIntent } from '@/components/Providers';
import { apiLogin } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wallet, Loader2, KeyRound, Copy, Check, ShieldAlert } from 'lucide-react';

export default function Login() {
  const { login, setScreen } = useGameStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);

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
        if (data.seedPhrase && data.walletMigrated) {
          setSeedPhrase(data.seedPhrase);
          setPendingUser({ email: user.email || email, username: user.username });
        } else {
          login(user.email || email, user.username, 'email');
        }
      } else {
        setError(res.error || 'Invalid email or password');
      }
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Seed phrase migration screen
  if (seedPhrase && pendingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mx-auto mb-3 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading text-lg font-semibold text-foreground mb-1">Wallet Upgraded</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Save your recovery phrase — it&apos;s the only way to recover your wallet.
              </p>
            </div>

            <div className="bg-destructive/5 border border-destructive/10 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-destructive text-xs font-medium">
                  Write these words down. Never share them.
                </p>
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
                I have saved my recovery phrase and understand it cannot be recovered if lost.
              </span>
            </label>

            <Button
              className="w-full"
              disabled={!seedConfirmed}
              onClick={() => login(pendingUser.email, pendingUser.username, 'email')}
            >
              Continue to Game
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.03] blur-[120px] rounded-full" />
      </div>

      <motion.div
        className="w-full max-w-sm relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary mx-auto mb-4 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <rect x="1" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
              <rect x="20" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            <span className="text-primary">Chain</span>
            <span className="text-foreground">Pong</span>
          </h1>
        </div>

        {/* Form */}
        <motion.form
          onSubmit={handleLogin}
          className="rounded-xl border border-border bg-card p-6 space-y-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <motion.div
              className="text-destructive text-sm bg-destructive/5 border border-destructive/10 rounded-lg px-3 py-2"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
              <input type="checkbox" className="rounded border-border bg-secondary accent-primary" />
              Remember me
            </label>
            <button type="button" onClick={() => setScreen('forgot-password')} className="text-primary text-sm hover:underline">
              Forgot password?
            </button>
          </div>

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Logging in...
              </span>
            ) : (
              'Log In'
            )}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              mounted && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={walletConnecting}
                  onClick={() => {
                    setWalletConnecting(true);
                    markWalletIntent();
                    openConnectModal();
                    // Reset after 30s in case user closes modal without connecting
                    setTimeout(() => setWalletConnecting(false), 30_000);
                  }}
                >
                  {walletConnecting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                  ) : (
                    <><Wallet className="w-4 h-4" /> Continue with Wallet</>
                  )}
                </Button>
              )
            )}
          </ConnectButton.Custom>
        </motion.form>

        <p className="text-center mt-5 text-muted-foreground text-sm">
          Don&apos;t have an account?{' '}
          <button onClick={() => setScreen('signup')} className="text-primary font-medium hover:underline">
            Sign Up
          </button>
        </p>
      </motion.div>
    </div>
  );
}
