'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { CHAIN_NAME, IS_TESTNET, BLOCK_EXPLORER, TOKEN_SYMBOL } from '@/lib/wagmi';
import { apiWithdraw } from '@/lib/api';

export default function Withdraw() {
  const { balance, setBalance, setScreen, authMethod, isConnected, address, gameWallet } = useGameStore();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [claimMode, setClaimMode] = useState<'withdraw' | 'compound'>('withdraw');

  // Pre-fill destination: wallet users get their connected wallet, email users enter manually
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

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/></svg>
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 tracking-tight">Claim Earnings</h1>
            <p className="text-gray-500 text-sm sm:text-base">Withdraw or auto-compound on {CHAIN_NAME}</p>
          </div>

          {IS_TESTNET && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-[10px] px-3 py-1 rounded-full bg-yellow-500/8 text-yellow-500/70 border border-yellow-500/15 font-medium tracking-wider uppercase">
                Testnet Mode — {CHAIN_NAME}
              </span>
            </div>
          )}

          {success ? (
            <motion.div
              className="glass-elevated rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-mint/10 border border-mint/20 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Withdrawal Sent!</h2>
              <p className="text-gray-400 mb-1">{amount} {TOKEN_SYMBOL} sent to your wallet</p>
              <p className="text-sm text-gray-600 mb-4">Transaction on {CHAIN_NAME}</p>

              {txHash && (
                <a
                  href={`${BLOCK_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-gold-light text-sm hover:text-gold transition-colors mb-6 font-medium"
                >
                  View on BaseScan
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              )}

              <div className="mt-4">
                <button
                  onClick={() => setScreen('lobby')}
                  className="btn-primary px-8 py-3 rounded-xl font-semibold"
                >
                  Back to Lobby
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="glass-elevated rounded-2xl sm:rounded-3xl p-6 sm:p-8">
              {/* Balance Display */}
              <div className="text-center mb-8">
                <div className="text-[10px] text-gray-600 mb-1.5 uppercase tracking-widest font-semibold">Available Balance</div>
                <div className="text-4xl sm:text-5xl font-bold text-gold tracking-tight">{balance.toFixed(4)}</div>
                <div className="text-sm text-gray-500 mt-1">{TOKEN_SYMBOL} on {CHAIN_NAME}</div>
              </div>

              {/* Claim Mode Toggle */}
              <div className="flex rounded-xl bg-white/[0.03] border border-white/5 p-0.5 mb-6">
                <button
                  onClick={() => setClaimMode('withdraw')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    claimMode === 'withdraw'
                      ? 'bg-gold/10 text-gold border border-gold/20'
                      : 'text-gray-500 border border-transparent hover:text-gray-300'
                  }`}
                >
                  Withdraw to Wallet
                </button>
                <button
                  onClick={() => setClaimMode('compound')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    claimMode === 'compound'
                      ? 'bg-mint/10 text-mint border border-mint/20'
                      : 'text-gray-500 border border-transparent hover:text-gray-300'
                  }`}
                >
                  Auto-Compound
                </button>
              </div>

              {claimMode === 'compound' ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-mint/10 border border-mint/15 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M17 1L21 5L17 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/><path d="M3 11V9C3 7.93913 3.42143 6.92172 4.17157 6.17157C4.92172 5.42143 5.93913 5 7 5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/><path d="M7 23L3 19L7 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/><path d="M21 13V15C21 16.0609 20.5786 17.0783 19.8284 17.8284C19.0783 18.5786 18.0609 19 17 19H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint"/></svg>
                  </div>
                  <p className="text-gray-400 text-sm mb-1">Keep staked for next match</p>
                  <p className="text-gray-600 text-xs">Your earnings stay in your game balance, ready for the next PvP match</p>
                  <button
                    onClick={() => setScreen('mode-select')}
                    className="mt-6 btn-primary px-8 py-3 rounded-xl font-semibold text-sm"
                  >
                    Play Another Match
                  </button>
                </div>
              ) : (
                <>
                  {/* Wallet check */}
                  {authMethod === 'wallet' && !isConnected && (
                    <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-3 mb-4 text-center">
                      <p className="text-red-400 text-sm">Wallet disconnected. Please reconnect to withdraw.</p>
                    </div>
                  )}

                  {/* Destination Address */}
                  <div className="mb-4">
                    <label className="text-[10px] text-gray-600 mb-2 block uppercase tracking-widest font-semibold">Send To</label>
                    <input
                      type="text"
                      value={toAddress || defaultAddress}
                      onChange={(e) => setToAddress(e.target.value)}
                      placeholder="0x... wallet address"
                      className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-gold/40 transition-colors font-mono"
                    />
                  </div>

                  {error && (
                    <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-3 mb-4 text-center">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="text-[10px] text-gray-600 mb-2 block uppercase tracking-widest font-semibold">Amount ({TOKEN_SYMBOL})</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.001"
                        max={balance}
                        className="w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-4 text-2xl text-white focus:outline-none focus:border-gold/40 transition-colors text-center font-bold"
                      />
                      <button
                        onClick={() => setAmount(balance.toFixed(4))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gold-light hover:text-gold transition-colors bg-gold/5 px-2.5 py-1 rounded-lg border border-gold/10 font-bold"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {/* Quick amounts */}
                  <div className="flex gap-2 mb-6">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setAmount((balance * pct / 100).toFixed(4))}
                        className="flex-1 py-2 rounded-lg bg-white/[0.03] text-sm text-gray-500 hover:bg-white/[0.06] hover:text-white transition-all border border-white/5 font-medium"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  {/* Network info */}
                  <div className="glass rounded-xl p-4 mb-6 space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Network</span>
                      <span className="text-white font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-mint online-dot" />
                        {CHAIN_NAME}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Est. Gas</span>
                      <span className="text-gray-400">~0.0001 {TOKEN_SYMBOL}</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">You receive</span>
                      <span className="text-mint font-bold">
                        {amount ? (parseFloat(amount) - 0.0001).toFixed(4) : '0.0000'} {TOKEN_SYMBOL}
                      </span>
                    </div>
                  </div>

                  {IS_TESTNET && (
                    <div className="bg-base-blue/5 border border-base-blue/10 rounded-xl p-3 mb-4">
                      <p className="text-xs text-base-blue/60 text-center">
                        Get free testnet ETH from{' '}
                        <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="underline hover:text-base-blue/80">
                          Alchemy Faucet
                        </a>
                        {' '}or{' '}
                        <a href="https://faucet.quicknode.com/base/sepolia" target="_blank" rel="noopener noreferrer" className="underline hover:text-base-blue/80">
                          QuickNode Faucet
                        </a>
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleWithdraw}
                    disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || processing}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                      !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance
                        ? 'bg-white/[0.03] text-gray-700 cursor-not-allowed border border-white/5'
                        : 'btn-primary'
                    }`}
                  >
                    {processing ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      'Withdraw to Wallet'
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-8 text-gray-600 hover:text-white transition-colors mx-auto block text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
