'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useEffect, useCallback } from 'react';
import { CHAIN_NAME, IS_TESTNET, TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiSyncDeposits } from '@/lib/api';

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = walletAddress;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

  // Poll for deposits every 15 seconds while on this screen
  useEffect(() => {
    syncDeposits(); // initial sync
    const interval = setInterval(syncDeposits, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 mx-auto mb-4 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L12 22M12 2L6 8M12 2L18 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Deposit Funds</h1>
            <p className="text-gray-500 text-sm">Send {TOKEN_SYMBOL} to your game wallet to start playing</p>
          </div>

          {/* Deposit Detected Banner */}
          {depositDetected && (
            <motion.div
              className="bg-mint/10 border border-mint/20 rounded-xl px-4 py-3 mb-4 text-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-mint text-sm font-medium">Deposit detected! Your balance has been updated.</p>
            </motion.div>
          )}

          {/* Wallet Address Card */}
          <div className="glass rounded-2xl p-5 sm:p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Game Wallet</h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-mint/10 text-mint font-medium">
                Active
              </span>
            </div>

            <div
              onClick={copyAddress}
              className="group relative bg-white/[0.03] border border-white/10 hover:border-gold/30 rounded-xl p-4 cursor-pointer transition-all"
            >
              <div className="text-xs text-gray-500 mb-2">Address</div>
              <div className="font-mono text-sm sm:text-base text-white break-all leading-relaxed">
                {walletAddress}
              </div>
              <div className="absolute top-3 right-3">
                <motion.div
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                    copied
                      ? 'bg-mint/10 text-mint border border-mint/20'
                      : 'bg-white/5 text-gray-500 border border-white/10 group-hover:text-gold-light group-hover:border-gold/20'
                  }`}
                  animate={copied ? { scale: [1, 1.1, 1] } : {}}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </motion.div>
              </div>
            </div>
          </div>

          {/* Network Info */}
          <div className="glass rounded-2xl p-5 sm:p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Network Details</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Network</span>
                <span className="text-sm text-white font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                  {CHAIN_NAME}
                  {IS_TESTNET && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-medium">TESTNET</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Token</span>
                <span className="text-sm text-white font-medium">{TOKEN_SYMBOL}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Game Balance</span>
                <span className="text-sm text-gold font-bold">{balance.toFixed(4)} {TOKEN_SYMBOL}</span>
              </div>
              {onChainBalance && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">On-Chain Balance</span>
                  <span className="text-sm text-mint font-bold">{parseFloat(onChainBalance).toFixed(4)} {TOKEN_SYMBOL}</span>
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={syncDeposits}
              disabled={syncing}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-white/[0.03] border border-white/10 hover:border-gold/30 text-gray-400 hover:text-white flex items-center justify-center gap-2"
            >
              {syncing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                  Checking for deposits...
                </>
              ) : (
                <>
                  Refresh Balance
                  {lastSync && <span className="text-[10px] text-gray-600 ml-1">(last: {lastSync})</span>}
                </>
              )}
            </button>
          </div>

          {/* Instructions */}
          <div className="glass rounded-2xl p-5 sm:p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">How to Deposit</h3>
            <div className="space-y-3">
              {[
                { step: '1', text: `Copy your game wallet address above` },
                { step: '2', text: `Open your external wallet (MetaMask, Coinbase, etc.)` },
                { step: '3', text: `Send ${TOKEN_SYMBOL} on ${CHAIN_NAME} to the address` },
                { step: '4', text: `Click "Refresh Balance" or wait — deposits are auto-detected` },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-gold font-bold">{item.step}</span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Testnet Faucet Links */}
          {IS_TESTNET && (
            <div className="glass rounded-2xl p-5 sm:p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Get Free Testnet ETH</h3>
              <p className="text-xs text-gray-500 mb-3">Need testnet {TOKEN_SYMBOL}? Get some for free from these faucets:</p>
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
                    className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-xl px-4 py-2.5 hover:border-gold/30 transition-all group"
                  >
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{faucet.name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-600 group-hover:text-gold transition-colors">
                      <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-4 py-3 mb-6">
            <div className="flex items-start gap-2.5">
              <span className="text-yellow-400 mt-0.5 shrink-0">!</span>
              <p className="text-xs text-yellow-400/80 leading-relaxed">
                Only send <strong className="text-yellow-400">{TOKEN_SYMBOL}</strong> on the <strong className="text-yellow-400">{CHAIN_NAME}</strong> network.
                Sending other tokens or using a different network may result in permanent loss of funds.
              </p>
            </div>
          </div>

          {/* Back Button */}
          <motion.button
            onClick={() => setScreen('profile')}
            className="text-gray-500 hover:text-white transition-colors mx-auto block text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Back to Profile
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
