'use client';

import { useGameStore } from '@/lib/store';
import { useState, useEffect, useCallback } from 'react';
import { CHAIN_NAME, IS_TESTNET, BLOCK_EXPLORER, TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiGetClaimable, apiClaimEarnings, apiWithdraw } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, Wallet, Loader2,
  Trophy, ExternalLink, AlertTriangle, Gift, ArrowDownToLine
} from 'lucide-react';

type Tab = 'claim' | 'withdraw';

export default function Withdraw() {
  const { balance, totalEarnings, setBalance, setScreen, authMethod, isConnected, address, gameWallet, syncFromBackend } = useGameStore();

  const [tab, setTab] = useState<Tab>('claim');
  const [claimable, setClaimable] = useState<number | null>(null);
  const [loadingClaimable, setLoadingClaimable] = useState(true);

  // Claim state
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState('');
  const [claimAmount, setClaimAmount] = useState(0);
  const [claimError, setClaimError] = useState('');

  // Withdraw state
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [processing, setProcessing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawTxHash, setWithdrawTxHash] = useState('');
  const [withdrawError, setWithdrawError] = useState('');

  const defaultAddress = authMethod === 'wallet' && address ? address : '';

  // Fetch claimable balance
  const fetchClaimable = useCallback(async () => {
    setLoadingClaimable(true);
    try {
      const res = await apiGetClaimable();
      if (res.success && res.data) {
        setClaimable(parseFloat(res.data.claimable));
      }
    } catch {
      setClaimable(0);
    } finally {
      setLoadingClaimable(false);
    }
  }, []);

  useEffect(() => {
    fetchClaimable();
  }, [fetchClaimable]);

  // Claim earnings
  const handleClaim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const res = await apiClaimEarnings();
      if (res.success && res.data) {
        setClaimTxHash(res.data.txHash);
        setClaimAmount(res.data.amount);
        setClaimSuccess(true);
        setClaimable(0);
        // Refresh backend stats
        syncFromBackend();
      } else {
        setClaimError(res.error || 'Claim failed');
      }
    } catch (err: any) {
      setClaimError(err.message || 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  // Withdraw from game balance
  const handleWithdraw = async () => {
    const val = parseFloat(amount);
    const dest = toAddress || defaultAddress;
    if (isNaN(val) || val <= 0 || val > balance) return;
    if (!dest || !/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      setWithdrawError('Please enter a valid wallet address');
      return;
    }
    setProcessing(true);
    setWithdrawError('');
    try {
      const res = await apiWithdraw(val, dest);
      if (res.success && res.data) {
        setWithdrawTxHash((res.data as any).txHash || '');
        setBalance(balance - val);
        setWithdrawSuccess(true);
      } else {
        setWithdrawError(res.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal failed');
    } finally {
      setProcessing(false);
    }
  };

  // Success screens
  if (claimSuccess) {
    return (
      <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold">Earnings Claimed!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {claimAmount.toFixed(4)} {TOKEN_SYMBOL} sent to your wallet
                </p>
              </div>
              {claimTxHash && (
                <a
                  href={`${BLOCK_EXPLORER}/tx/${claimTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
                >
                  View on BaseScan <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="outline" onClick={() => { setClaimSuccess(false); fetchClaimable(); }}>
                  Back
                </Button>
                <Button onClick={() => setScreen('lobby')}>
                  Back to Lobby
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (withdrawSuccess) {
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
              </div>
              {withdrawTxHash && (
                <a
                  href={`${BLOCK_EXPLORER}/tx/${withdrawTxHash}`}
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
          <button onClick={() => setScreen('profile')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Earnings & Wallet</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Claim winnings or withdraw funds</p>
        </div>

        {IS_TESTNET && (
          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">
            Testnet Mode — {CHAIN_NAME}
          </Badge>
        )}

        {/* Stats row: Total Earnings | Claimable | Wallet Balance */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="py-4 text-center">
              <Trophy className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Earned</p>
              <p className="text-lg font-bold font-heading text-yellow-400">{totalEarnings.toFixed(4)}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30">
            <CardContent className="py-4 text-center">
              <Gift className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Claimable</p>
              <p className="text-lg font-bold font-heading text-primary">
                {loadingClaimable ? '...' : (claimable ?? 0).toFixed(4)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <Wallet className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Balance</p>
              <p className="text-lg font-bold font-heading text-emerald-400">{balance.toFixed(4)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTab('claim')}
            className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-all ${
              tab === 'claim'
                ? 'bg-primary/[0.08] text-primary border border-primary/20'
                : 'text-muted-foreground border border-transparent hover:text-foreground'
            }`}
          >
            Claim Earnings
          </button>
          <button
            onClick={() => setTab('withdraw')}
            className={`flex-1 py-2.5 rounded-md text-xs font-semibold transition-all ${
              tab === 'withdraw'
                ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20'
                : 'text-muted-foreground border border-transparent hover:text-foreground'
            }`}
          >
            Withdraw Balance
          </button>
        </div>

        {tab === 'claim' ? (
          /* ── CLAIM EARNINGS ──────────────────────────── */
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground mb-1">Your unclaimed match winnings</p>
                <p className="text-4xl font-bold font-heading text-primary">
                  {loadingClaimable ? '...' : (claimable ?? 0).toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{TOKEN_SYMBOL} available to claim</p>
              </div>

              <Separator />

              <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destination</span>
                  <span className="font-mono text-xs">
                    {gameWallet ? `${gameWallet.slice(0, 6)}...${gameWallet.slice(-4)}` :
                     address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'No wallet'}
                  </span>
                </div>
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
              </div>

              {claimError && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3 text-center flex items-center gap-2 justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" /> {claimError}
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleClaim}
                disabled={!claimable || claimable <= 0 || claiming || loadingClaimable}
              >
                {claiming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</>
                ) : !claimable || claimable <= 0 ? (
                  <>No Earnings to Claim</>
                ) : (
                  <><Gift className="w-4 h-4" /> Claim {(claimable ?? 0).toFixed(4)} {TOKEN_SYMBOL}</>
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Earnings are credited when you win matches. Claim sends ETH from the treasury to your wallet.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* ── WITHDRAW BALANCE ────────────────────────── */
          <Card>
            <CardContent className="p-5 space-y-4">
              {authMethod === 'wallet' && !isConnected && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3 text-center">
                  Wallet disconnected. Please reconnect to withdraw.
                </div>
              )}

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-2 block">Send To</label>
                <Input
                  value={toAddress || defaultAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="0x... wallet address"
                  className="font-mono text-sm"
                />
              </div>

              {withdrawError && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3 text-center">
                  {withdrawError}
                </div>
              )}

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
