'use client';

import { useGameStore } from '@/lib/store';
import { useState, useEffect, useCallback } from 'react';
import { CHAIN_NAME, IS_TESTNET, TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiSyncDeposits } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Copy, Check, RefreshCw, Loader2, ArrowDownToLine,
  AlertTriangle, ExternalLink, Wallet
} from 'lucide-react';

export default function Deposit() {
  const { gameWallet, setScreen, balance, setBalance } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [onChainBalance, setOnChainBalance] = useState<string | null>(null);
  const [depositDetected, setDepositDetected] = useState(false);

  const walletAddress = gameWallet || '';

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
    } catch {
      const el = document.createElement('textarea');
      el.value = walletAddress;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const syncDeposits = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await apiSyncDeposits();
      if (res.success && res.data) {
        const data = res.data as any;
        setOnChainBalance(data.onChainBalance);
        setLastSync(new Date().toLocaleTimeString());
        if (data.newDeposit) {
          setDepositDetected(true);
          const newBalance = parseFloat(data.gameBalance);
          if (!isNaN(newBalance)) setBalance(newBalance);
          setTimeout(() => setDepositDetected(false), 5000);
        }
      }
    } catch {
      // silently fail
    } finally {
      setSyncing(false);
    }
  }, [syncing, setBalance]);

  useEffect(() => {
    syncDeposits();
    const interval = setInterval(syncDeposits, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('profile')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Deposit Funds</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Send {TOKEN_SYMBOL} to your game wallet to start playing</p>
        </div>

        {/* Deposit Detected Banner */}
        {depositDetected && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-center">
            <p className="text-emerald-400 text-sm font-medium">Deposit detected! Your balance has been updated.</p>
          </div>
        )}

        {/* Wallet Address */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Your Game Wallet
              </h3>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Active</Badge>
            </div>

            <button
              onClick={copyAddress}
              className="w-full text-left rounded-lg border border-border hover:border-primary/30 p-4 transition-colors group"
            >
              <p className="text-[10px] text-muted-foreground mb-1.5">Address</p>
              <p className="font-mono text-sm break-all leading-relaxed">{walletAddress}</p>
              <div className="flex justify-end mt-2">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  copied
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-muted text-muted-foreground group-hover:text-primary'
                }`}>
                  {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </span>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Network Details */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">Network Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {CHAIN_NAME}
                  {IS_TESTNET && <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-500 ml-1">TESTNET</Badge>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium">{TOKEN_SYMBOL}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Game Balance</span>
                <span className="text-primary font-semibold">{balance.toFixed(4)} {TOKEN_SYMBOL}</span>
              </div>
              {onChainBalance && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">On-Chain Balance</span>
                  <span className="text-emerald-400 font-semibold">{parseFloat(onChainBalance).toFixed(4)} {TOKEN_SYMBOL}</span>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={syncDeposits}
              disabled={syncing}
            >
              {syncing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for deposits...</>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Balance
                  {lastSync && <span className="text-[10px] text-muted-foreground ml-1">(last: {lastSync})</span>}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-4">How to Deposit</h3>
            <div className="space-y-3">
              {[
                'Copy your game wallet address above',
                'Open your external wallet (MetaMask, Coinbase, etc.)',
                `Send ${TOKEN_SYMBOL} on ${CHAIN_NAME} to the address`,
                'Click "Refresh Balance" or wait — deposits are auto-detected',
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-primary font-bold">{i + 1}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Testnet Faucets */}
        {IS_TESTNET && (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-2">Get Free Testnet ETH</h3>
              <p className="text-xs text-muted-foreground mb-3">Need testnet {TOKEN_SYMBOL}? Get some for free:</p>
              <div className="space-y-2">
                {[
                  { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia' },
                  { name: 'QuickNode Faucet', url: 'https://faucet.quicknode.com/base/sepolia' },
                  { name: 'Superchain Faucet', url: 'https://app.optimism.io/faucet' },
                ].map((faucet) => (
                  <a
                    key={faucet.name}
                    href={faucet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 hover:border-primary/30 transition-colors group"
                  >
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{faucet.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning */}
        <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-400/80 leading-relaxed">
              Only send <strong className="text-yellow-400">{TOKEN_SYMBOL}</strong> on the <strong className="text-yellow-400">{CHAIN_NAME}</strong> network.
              Sending other tokens or using a different network may result in permanent loss of funds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
