'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import { TOKEN_SYMBOL, BLOCK_EXPLORER } from '@/lib/wagmi';
import { apiGetTransactions } from '@/lib/api';

interface Transaction {
  id: string;
  type: string;
  amount: string;
  status: string;
  txHash: string | null;
  matchId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; sign: '+' | '-' | '' }> = {
  DEPOSIT: { label: 'Deposit', color: 'text-mint', icon: '↓', sign: '+' },
  WITHDRAWAL: { label: 'Withdrawal', color: 'text-coral', icon: '↑', sign: '-' },
  PAYOUT: { label: 'Match Win', color: 'text-gold', icon: '★', sign: '+' },
  STAKE_LOCK: { label: 'Stake Locked', color: 'text-yellow-400', icon: '🔒', sign: '-' },
  STAKE_RETURN: { label: 'Stake Returned', color: 'text-lavender', icon: '↩', sign: '+' },
  BOARD_PURCHASE: { label: 'Board Purchase', color: 'text-purple-400', icon: '🛒', sign: '-' },
  PROTOCOL_FEE: { label: 'Match Fee', color: 'text-gray-500', icon: '⚡', sign: '-' },
};

export default function TransactionHistory() {
  const { setScreen } = useGameStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadTransactions(page);
  }, [page]);

  const loadTransactions = async (p: number) => {
    setLoading(true);
    try {
      const res = await apiGetTransactions(p, 20);
      if (res.success && res.data) {
        const data = res.data as any;
        setTransactions(data.transactions || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen gradient-bg pt-16 sm:pt-20 pb-20 sm:pb-24 px-3 sm:px-4">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-lavender/20 to-lavender/5 border border-lavender/20 mx-auto mb-4 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender" />
                <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5C15 6.10457 14.1046 7 13 7H11C9.89543 7 9 6.10457 9 5Z" stroke="currentColor" strokeWidth="2" className="text-lavender" />
                <path d="M9 12H15M9 16H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Transaction History</h1>
            <p className="text-gray-500 text-sm">All your deposits, withdrawals, and earnings</p>
          </div>

          {/* Transactions List */}
          <div className="glass rounded-2xl p-4 sm:p-6 mb-4">
            {loading ? (
              <div className="text-center py-8">
                <span className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin inline-block" />
                <p className="text-gray-500 text-sm mt-3">Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-600" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">No transactions yet</p>
                <p className="text-gray-600 text-xs mt-1">Play matches or deposit funds to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const config = TYPE_CONFIG[tx.type] || { label: tx.type, color: 'text-gray-400', icon: '•', sign: '' };
                  return (
                    <div key={tx.id} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 hover:border-white/10 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg shrink-0">{config.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              tx.status === 'CONFIRMED' ? 'bg-mint/10 text-mint' :
                              tx.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400'
                            }`}>
                              {tx.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-600 mt-0.5">{formatDate(tx.createdAt)}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className={`text-sm font-bold ${config.sign === '+' ? 'text-mint' : config.sign === '-' ? 'text-coral' : 'text-white'}`}>
                          {config.sign}{parseFloat(tx.amount).toFixed(4)} {TOKEN_SYMBOL}
                        </div>
                        {tx.txHash && (
                          <a
                            href={`${BLOCK_EXPLORER}/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-gold-light hover:text-gold transition-colors"
                          >
                            View tx
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-white/5">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="text-sm text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="text-sm text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
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
