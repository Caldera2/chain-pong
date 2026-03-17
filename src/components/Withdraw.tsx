'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState } from 'react';

export default function Withdraw() {
  const { balance, setBalance, setScreen } = useGameStore();
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleWithdraw = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0 || val > balance) return;
    setProcessing(true);
    setTimeout(() => {
      setBalance(balance - val);
      setProcessing(false);
      setSuccess(true);
    }, 2000);
  };

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-white mb-2 text-center">Withdraw</h1>
          <p className="text-gray-400 text-center mb-10">Cash out your earnings to Base</p>

          {success ? (
            <motion.div
              className="glass rounded-3xl p-10 text-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-white mb-2">Withdrawal Sent!</h2>
              <p className="text-gray-400 mb-2">{amount} ETH sent to your wallet</p>
              <p className="text-sm text-gray-500 mb-6">Transaction will confirm in ~2 seconds on Base</p>
              <button
                onClick={() => setScreen('lobby')}
                className="btn-primary px-8 py-3 rounded-xl font-semibold text-white"
              >
                Back to Lobby
              </button>
            </motion.div>
          ) : (
            <div className="glass rounded-3xl p-8">
              {/* Balance Display */}
              <div className="text-center mb-8">
                <div className="text-sm text-gray-500 mb-1">Available Balance</div>
                <div className="text-4xl font-bold text-neon-yellow">{balance.toFixed(4)} ETH</div>
                <div className="text-sm text-gray-500 mt-1">≈ ${(balance * 3200).toFixed(2)} USD</div>
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">Amount (ETH)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.001"
                    max={balance}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-2xl text-white focus:outline-none focus:border-neon-blue transition-colors text-center"
                  />
                  <button
                    onClick={() => setAmount(balance.toFixed(4))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neon-blue hover:underline"
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
                    className="flex-1 py-2 rounded-lg bg-white/5 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Network info */}
              <div className="glass rounded-xl p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Network</span>
                  <span className="text-white font-medium">Base</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. Gas</span>
                  <span className="text-white">~0.0001 ETH</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">You receive</span>
                  <span className="text-neon-green font-medium">
                    {amount ? (parseFloat(amount) - 0.0001).toFixed(4) : '0.0000'} ETH
                  </span>
                </div>
              </div>

              <button
                onClick={handleWithdraw}
                disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || processing}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance
                    ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                    : 'btn-primary text-white'
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
            </div>
          )}
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-8 text-gray-500 hover:text-white transition-colors mx-auto block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}
