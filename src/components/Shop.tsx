'use client';

import { useGameStore, Board } from '@/lib/store';
import { IS_TESTNET, CHAIN_NAME, TOKEN_SYMBOL } from '@/lib/wagmi';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Check, Wallet, Lock } from 'lucide-react';

const RARITY_STYLES: Record<string, { label: string; text: string; border: string; bg: string }> = {
  common:    { label: 'Common',    text: 'text-zinc-400',   border: 'border-zinc-500/20', bg: 'bg-zinc-500/10' },
  rare:      { label: 'Rare',      text: 'text-blue-400',   border: 'border-blue-500/20', bg: 'bg-blue-500/10' },
  epic:      { label: 'Epic',      text: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/10' },
  legendary: { label: 'Legendary', text: 'text-amber-400',  border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
};

function BoardCard({ board, onBuy, canAfford }: { board: Board; onBuy: () => void; canAfford: boolean }) {
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
              disabled={!canAfford}
              variant={canAfford ? 'default' : 'outline'}
            >
              {canAfford ? (
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

export default function Shop() {
  const { boards, buyBoard, balance, walletBalance, authMethod, setScreen } = useGameStore();
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

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
              onBuy={() => buyBoard(board.id)}
              canAfford={effectiveBalance >= board.price}
            />
          ))}
        </div>

        {filteredBoards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">No boards in this category</p>
          </div>
        )}
      </div>
    </div>
  );
}
