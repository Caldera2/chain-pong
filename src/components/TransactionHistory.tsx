'use client';

import { useGameStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import { TOKEN_SYMBOL, BLOCK_EXPLORER } from '@/lib/wagmi';
import { apiGetTransactions } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, ArrowDownToLine, ArrowUpRight, Trophy, Lock, Undo2,
  ShoppingBag, Zap, FileText, Loader2, ChevronLeft, ChevronRight,
  ExternalLink
} from 'lucide-react';

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

const TYPE_CONFIG: Record<string, { label: string; Icon: typeof Trophy; colorClass: string; sign: '+' | '-' | '' }> = {
  DEPOSIT:        { label: 'Deposit',        Icon: ArrowDownToLine, colorClass: 'text-emerald-400', sign: '+' },
  WITHDRAWAL:     { label: 'Withdrawal',     Icon: ArrowUpRight,    colorClass: 'text-red-400',     sign: '-' },
  PAYOUT:         { label: 'Match Win',      Icon: Trophy,          colorClass: 'text-amber-400',   sign: '+' },
  STAKE_LOCK:     { label: 'Stake Locked',   Icon: Lock,            colorClass: 'text-yellow-400',  sign: '-' },
  STAKE_RETURN:   { label: 'Stake Returned', Icon: Undo2,           colorClass: 'text-violet-400',  sign: '+' },
  BOARD_PURCHASE: { label: 'Board Purchase', Icon: ShoppingBag,     colorClass: 'text-purple-400',  sign: '-' },
  PROTOCOL_FEE:   { label: 'Match Fee',      Icon: Zap,             colorClass: 'text-muted-foreground', sign: '-' },
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
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('profile')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Transaction History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All your deposits, withdrawals, and earnings</p>
        </div>

        {/* Transactions */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            {loading ? (
              <div className="text-center py-10">
                <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <h2 className="font-heading text-lg font-semibold mb-1">No Transactions Yet</h2>
                <p className="text-sm text-muted-foreground">Play matches or deposit funds to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const config = TYPE_CONFIG[tx.type] || { label: tx.type, Icon: Zap, colorClass: 'text-muted-foreground', sign: '' as const };
                  const IconComp = config.Icon;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
                          <IconComp className={`w-4 h-4 ${config.colorClass}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${config.colorClass}`}>{config.label}</span>
                            <Badge
                              variant="outline"
                              className={`text-[8px] ${
                                tx.status === 'CONFIRMED' ? 'border-emerald-500/30 text-emerald-400' :
                                tx.status === 'PENDING' ? 'border-yellow-500/30 text-yellow-400' :
                                'border-red-500/30 text-red-400'
                              }`}
                            >
                              {tx.status}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(tx.createdAt)}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`text-sm font-semibold ${
                          config.sign === '+' ? 'text-emerald-400' : config.sign === '-' ? 'text-red-400' : ''
                        }`}>
                          {config.sign}{parseFloat(tx.amount).toFixed(4)} {TOKEN_SYMBOL}
                        </p>
                        {tx.txHash && (
                          <a
                            href={`${BLOCK_EXPLORER}/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                          >
                            View tx <ExternalLink className="w-2.5 h-2.5" />
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
              <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
