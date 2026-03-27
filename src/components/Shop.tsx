'use client';

import { useGameStore, Board } from '@/lib/store';
import { IS_TESTNET, CHAIN_NAME, TOKEN_SYMBOL, ACTIVE_CHAIN } from '@/lib/wagmi';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, Check, Wallet, Lock, Loader2,
  ShieldCheck, AlertTriangle, X,
} from 'lucide-react';
import { useSendTransaction, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi';
import { parseEther } from 'viem';

// Treasury address for wallet-user on-chain purchases
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0x25f771D0B086602FEc043B6cCa1eD3E5fDcd8F1d';

const RARITY_STYLES: Record<string, { label: string; text: string; border: string; bg: string }> = {
  common:    { label: 'Common',    text: 'text-zinc-400',   border: 'border-zinc-500/20', bg: 'bg-zinc-500/10' },
  rare:      { label: 'Rare',      text: 'text-blue-400',   border: 'border-blue-500/20', bg: 'bg-blue-500/10' },
  epic:      { label: 'Epic',      text: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/10' },
  legendary: { label: 'Legendary', text: 'text-amber-400',  border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
};

// ─── Board Card ────────────────────────────────────────
function BoardCard({
  board,
  onBuy,
  canAfford,
  isBuying,
}: {
  board: Board;
  onBuy: () => void;
  canAfford: boolean;
  isBuying: boolean;
}) {
  const rs = RARITY_STYLES[board.rarity] || RARITY_STYLES.common;

  return (
    <Card className="group flex flex-col overflow-hidden hover:border-border/80 transition-colors">
      {/* Preview */}
      <div
        className="h-32 sm:h-36 relative flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(145deg, ${board.color}10, ${board.color}05)` }}
      >
        <span className="text-4xl sm:text-5xl select-none">{board.perkIcon}</span>
        <Badge className={`absolute top-2.5 right-2.5 ${rs.text} ${rs.bg} ${rs.border} text-[9px]`} variant="outline">
          {rs.label}
        </Badge>
        {board.owned && (
          <Badge className="absolute top-2.5 left-2.5 text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400" variant="outline">
            Owned
          </Badge>
        )}
      </div>

      {/* Info */}
      <CardContent className="p-3.5 sm:p-4 flex flex-col flex-1">
        <h3 className="font-heading text-sm sm:text-base font-semibold mb-0.5">{board.name}</h3>
        <p className="text-xs font-medium mb-1.5" style={{ color: board.color }}>{board.perk}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 flex-1">{board.perkDescription}</p>

        {board.owned ? (
          <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5" /> Owned
          </div>
        ) : board.price === 0 ? (
          <div className="py-2 rounded-lg border border-border text-center text-xs text-muted-foreground font-medium">
            Free
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Price</span>
              <span className={`font-semibold ${canAfford ? 'text-primary' : 'text-red-400/70'}`}>
                {board.price} {TOKEN_SYMBOL}
              </span>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={onBuy}
              disabled={!canAfford || isBuying}
              variant={canAfford ? 'default' : 'outline'}
            >
              {isBuying ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Processing...</>
              ) : canAfford ? (
                <>Buy</>
              ) : (
                <><Lock className="w-3 h-3" /> Insufficient</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Purchase Confirmation Modal ───────────────────────
function PurchaseModal({
  board,
  status,
  error,
  onConfirm,
  onClose,
  authMethod,
}: {
  board: Board;
  status: 'confirm' | 'signing' | 'confirming' | 'success' | 'error';
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  authMethod: string;
}) {
  const rs = RARITY_STYLES[board.rarity] || RARITY_STYLES.common;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={status === 'confirm' || status === 'error' ? onClose : undefined} />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-sm border-border/60">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Close button */}
          {(status === 'confirm' || status === 'error' || status === 'success') && (
            <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Board preview */}
          <div className="text-center space-y-2">
            <span className="text-4xl">{board.perkIcon}</span>
            <h3 className="font-heading text-lg font-bold">{board.name}</h3>
            <Badge className={`${rs.text} ${rs.bg} ${rs.border} text-[10px]`} variant="outline">
              {rs.label}
            </Badge>
          </div>

          {/* Status-specific content */}
          {status === 'confirm' && (
            <>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-semibold">{board.price} {TOKEN_SYMBOL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <Badge variant="outline" className="text-[10px]">{CHAIN_NAME}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="text-xs">{authMethod === 'wallet' ? 'Connected Wallet' : 'Game Wallet'}</span>
                </div>
              </div>
              <Button className="w-full" onClick={onConfirm}>
                <ShieldCheck className="w-4 h-4" />
                {authMethod === 'wallet' ? 'Confirm in Wallet' : 'Confirm Purchase'}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                {authMethod === 'wallet'
                  ? 'MetaMask will open to sign the transaction'
                  : 'ETH will be sent from your game wallet to treasury'}
              </p>
            </>
          )}

          {status === 'signing' && (
            <div className="text-center space-y-3 py-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">Waiting for wallet signature...</p>
              <p className="text-xs text-muted-foreground">Confirm the transaction in MetaMask</p>
            </div>
          )}

          {status === 'confirming' && (
            <div className="text-center space-y-3 py-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">Confirming on {CHAIN_NAME}...</p>
              <p className="text-xs text-muted-foreground">Waiting for network confirmation</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-3 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-emerald-400">Purchase Complete!</p>
              <p className="text-xs text-muted-foreground">{board.name} has been added to your collection</p>
              <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-3 py-2">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm font-medium text-red-400">Purchase Failed</p>
              <p className="text-xs text-muted-foreground">{error || 'Something went wrong. No ETH was deducted.'}</p>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Shop Component ───────────────────────────────
export default function Shop() {
  const {
    boards, buyBoard, balance, walletBalance, authMethod,
    setScreen, purchaseStatus, purchaseError,
  } = useGameStore();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [modalStatus, setModalStatus] = useState<'confirm' | 'signing' | 'confirming' | 'success' | 'error'>('confirm');
  const [modalError, setModalError] = useState<string | null>(null);
  const [buyingBoardId, setBuyingBoardId] = useState<string | null>(null);

  // Wagmi: send transaction + chain switching (for wallet users only)
  const { sendTransactionAsync } = useSendTransaction();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  const handleBuyClick = useCallback((board: Board) => {
    setSelectedBoard(board);
    setModalStatus('confirm');
    setModalError(null);
  }, []);

  const handleConfirmPurchase = useCallback(async () => {
    if (!selectedBoard) return;

    setBuyingBoardId(selectedBoard.id);
    let txHash: string | undefined;

    try {
      // ── Step 1: For wallet users, sign MetaMask transaction first ──
      if (authMethod === 'wallet' && selectedBoard.price > 0) {
        setModalStatus('signing');
        try {
          // Auto-switch to Base Sepolia if wallet is on wrong chain
          if (walletChainId !== ACTIVE_CHAIN.id) {
            try {
              await switchChainAsync({ chainId: ACTIVE_CHAIN.id });
            } catch {
              setModalStatus('error');
              setModalError(`Please switch your wallet to ${CHAIN_NAME}`);
              setBuyingBoardId(null);
              return;
            }
          }

          const hash = await sendTransactionAsync({
            to: TREASURY_ADDRESS as `0x${string}`,
            value: parseEther(selectedBoard.price.toString()),
            chainId: ACTIVE_CHAIN.id,
          });
          txHash = hash;
          setModalStatus('confirming');
        } catch (err: any) {
          // User rejected or MetaMask error
          const msg = err?.shortMessage || err?.message || 'Transaction rejected';
          setModalStatus('error');
          setModalError(msg.includes('User rejected') ? 'Transaction rejected by user' : msg);
          setBuyingBoardId(null);
          return;
        }
      } else {
        // Email users — backend handles the on-chain transfer
        setModalStatus('confirming');
      }

      // ── Step 2: Call backend API to record purchase ──
      // For wallet users, pass the txHash from MetaMask
      // For email users, backend sends ETH from game wallet
      const result = await buyBoard(selectedBoard.id, txHash);

      if (result.success) {
        setModalStatus('success');
      } else {
        setModalStatus('error');
        setModalError(result.error || 'Purchase failed on server');
      }
    } catch (err: any) {
      setModalStatus('error');
      setModalError(err?.message || 'Unexpected error');
    } finally {
      setBuyingBoardId(null);
    }
  }, [selectedBoard, authMethod, sendTransactionAsync, switchChainAsync, walletChainId, buyBoard]);

  const handleCloseModal = useCallback(() => {
    setSelectedBoard(null);
    setBuyingBoardId(null);
    setModalStatus('confirm');
    setModalError(null);
  }, []);

  const filteredBoards = activeFilter === 'all'
    ? boards
    : boards.filter((b) => b.rarity === activeFilter);

  const countByRarity: Record<string, number> = {
    all: boards.length,
    common: boards.filter(b => b.rarity === 'common').length,
    rare: boards.filter(b => b.rarity === 'rare').length,
    epic: boards.filter(b => b.rarity === 'epic').length,
    legendary: boards.filter(b => b.rarity === 'legendary').length,
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'common', label: 'Common' },
    { key: 'rare', label: 'Rare' },
    { key: 'epic', label: 'Epic' },
    { key: 'legendary', label: 'Legendary' },
  ];

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Skill Shop</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Boards with unique perks to give you an edge</p>
            </div>
            <div className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-primary">{effectiveBalance.toFixed(4)}</span>
              <span className="text-muted-foreground text-xs">{TOKEN_SYMBOL}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                activeFilter === f.key
                  ? 'border-primary/30 bg-primary/[0.06] text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-50">{countByRarity[f.key]}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredBoards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onBuy={() => handleBuyClick(board)}
              canAfford={effectiveBalance >= board.price}
              isBuying={buyingBoardId === board.id}
            />
          ))}
        </div>

        {filteredBoards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No boards in this category</p>
          </div>
        )}
      </div>

      {/* Purchase Confirmation Modal */}
      {selectedBoard && (
        <PurchaseModal
          board={selectedBoard}
          status={modalStatus}
          error={modalError}
          onConfirm={handleConfirmPurchase}
          onClose={handleCloseModal}
          authMethod={authMethod || 'email'}
        />
      )}
    </div>
  );
}
