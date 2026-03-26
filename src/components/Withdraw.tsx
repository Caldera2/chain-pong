'use client';

import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { CHAIN_NAME, IS_TESTNET, BLOCK_EXPLORER, TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiWithdraw } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, Wallet, Loader2,
  RefreshCw, ExternalLink, AlertTriangle
} from 'lucide-react';

export default function Withdraw() {
  const { balance, setBalance, setScreen, authMethod, isConnected, address, gameWallet } = useGameStore();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [claimMode, setClaimMode] = useState<'withdraw' | 'compound'>('withdraw');

  const defaultAddress = authMethod === 'wallet' && address ? address : '';

  const handleWithdraw = async () => {
    const val = parseFloat(amount);
    const dest = toAddress || defaultAddress;
    if (isNaN(val) || val <= 0 || val > balance) return;
    if (!dest || !/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      setError('Please enter a valid wallet address');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await apiWithdraw(val, dest);
      if (res.success && res.data) {
        setTxHash((res.data as any).txHash || '');
        setBalance(balance - val);
        setSuccess(true);
      } else {
        setError(res.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      setError(err.message || 'Withdrawal failed');
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold">Withdrawal Sent!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {amount} {TOKEN_SYMBOL} sent to your wallet
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Transaction on {CHAIN_NAME}</p>
              </div>
              {txHash && (
                <a
                  href={`${BLOCK_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
                >
                  View on BaseScan <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <Button className="mt-4" onClick={() => setScreen('lobby')}>
                Back to Lobby
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Claim Earnings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Withdraw or auto-compound on {CHAIN_NAME}</p>
        </div>

        {IS_TESTNET && (
          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">
            Testnet Mode — {CHAIN_NAME}
          </Badge>
        )}

        {/* Balance */}
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-1">Available Balance</p>
            <p className="text-4xl font-bold font-heading text-primary">{balance.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground mt-1">{TOKEN_SYMBOL} on {CHAIN_NAME}</p>
          </CardContent>
        </Card>

        {/* Mode Toggle */}
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setClaimMode('withdraw')}
            className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-all ${
              claimMode === 'withdraw'
                ? 'bg-primary/[0.08] text-primary border border-primary/20'
                : 'text-muted-foreground border border-transparent hover:text-foreground'
            }`}
          >
            Withdraw to Wallet
          </button>
          <button
            onClick={() => setClaimMode('compound')}
            className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-all ${
              claimMode === 'compound'
                ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20'
                : 'text-muted-foreground border border-transparent hover:text-foreground'
            }`}
          >
            Auto-Compound
          </button>
        </div>

        {claimMode === 'compound' ? (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm text-muted-foreground">Keep staked for next match</p>
              <p className="text-xs text-muted-foreground/60">Your earnings stay in your game balance, ready for the next PvP match</p>
              <Button onClick={() => setScreen('mode-select')} className="mt-2">
                Play Another Match
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Wallet disconnected warning */}
              {authMethod === 'wallet' && !isConnected && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3 text-center">
                  Wallet disconnected. Please reconnect to withdraw.
                </div>
              )}

              {/* Destination */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-2 block">Send To</label>
                <Input
                  value={toAddress || defaultAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="0x... wallet address"
                  className="font-mono text-sm"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3 text-center">
                  {error}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-2 block">
                  Amount ({TOKEN_SYMBOL})
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.001"
                    max={balance}
                    className="text-center text-2xl font-bold pr-16 h-14"
                  />
                  <button
                    onClick={() => setAmount(balance.toFixed(4))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-bold bg-primary/[0.06] px-2.5 py-1 rounded-md border border-primary/10 hover:bg-primary/10 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setAmount((balance * pct / 100).toFixed(4))}
                    className="flex-1 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border border-border hover:border-border/80"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Network info */}
              <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {CHAIN_NAME}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Gas</span>
                  <span className="text-muted-foreground">~0.0001 {TOKEN_SYMBOL}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="text-emerald-400 font-semibold">
                    {amount ? (parseFloat(amount) - 0.0001).toFixed(4) : '0.0000'} {TOKEN_SYMBOL}
                  </span>
                </div>
              </div>

              {IS_TESTNET && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground text-center">
                    Get free testnet ETH from{' '}
                    <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Alchemy Faucet
                    </a>
                    {' '}or{' '}
                    <a href="https://faucet.quicknode.com/base/sepolia" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      QuickNode Faucet
                    </a>
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleWithdraw}
                disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || processing}
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><ArrowUpRight className="w-4 h-4" /> Withdraw to Wallet</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
