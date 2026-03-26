'use client';

import { useGameStore, STAKE_TIERS } from '@/lib/store';
import { TOKEN_SYMBOL, CHAIN_NAME } from '@/lib/wagmi';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Wallet, Zap, ShoppingBag, Check } from 'lucide-react';

export default function ModeSelect() {
  const { setScreen, setGameMode, boards, selectedBoard, setSelectedBoard, pvpStakeAmount, setPvpStakeAmount, walletBalance, balance, authMethod } = useGameStore();
  const [showStakeWarning, setShowStakeWarning] = useState('');

  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  const startGame = () => {
    if (effectiveBalance < pvpStakeAmount) {
      setShowStakeWarning(`Insufficient balance. Need ${pvpStakeAmount} ${TOKEN_SYMBOL}, have ${effectiveBalance.toFixed(4)}`);
      return;
    }
    setShowStakeWarning('');
    setGameMode('pvp');
    setScreen('matchmaking');
  };

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">PvP Match</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Challenge a player — winner takes the pot</p>
        </div>

        {/* Balance */}
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Balance</p>
                <p className="text-sm font-semibold">
                  {effectiveBalance.toFixed(4)} <span className="text-primary text-xs">{TOKEN_SYMBOL}</span>
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setScreen('deposit')}>Deposit</Button>
          </CardContent>
        </Card>

        {/* Stake Selection */}
        <div>
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Stake Amount</h3>
          <div className="grid grid-cols-3 gap-2">
            {STAKE_TIERS.map((tier) => (
              <button
                key={tier}
                onClick={() => { setPvpStakeAmount(tier); setShowStakeWarning(''); }}
                className={`py-3 rounded-lg text-xs font-semibold transition-all border ${
                  pvpStakeAmount === tier
                    ? 'border-primary/40 bg-primary/[0.06] text-primary'
                    : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                }`}
              >
                {tier} {TOKEN_SYMBOL}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-muted-foreground">Both players stake <span className="text-foreground font-medium">{pvpStakeAmount}</span></span>
            <span className="text-emerald-400 font-semibold">Winner gets {(pvpStakeAmount * 2).toFixed(4)} {TOKEN_SYMBOL}</span>
          </div>
        </div>

        {/* Warning */}
        {showStakeWarning && (
          <div className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg px-4 py-3">
            {showStakeWarning}
          </div>
        )}

        {/* Board Selector */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Select Board</h3>
            <button onClick={() => setScreen('shop')} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Get More
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ownedBoards.map((board) => {
              const isSelected = selectedBoard === board.id;
              return (
                <button
                  key={board.id}
                  onClick={() => setSelectedBoard(board.id)}
                  className={`relative rounded-lg p-3 text-left transition-all border ${
                    isSelected
                      ? 'border-primary/40 bg-primary/[0.04]'
                      : 'border-border hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[8px]" style={{ color: board.color, borderColor: `${board.color}30` }}>
                      {board.rarity}
                    </Badge>
                    {isSelected && <Check className="w-3 h-3 text-primary" />}
                  </div>
                  <span className="text-xl block mb-1.5">{board.perkIcon}</span>
                  <p className="text-xs font-medium truncate">{board.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{board.perk === 'None' ? 'No perk' : board.perk}</p>
                </button>
              );
            })}
          </div>

          {currentBoard && (
            <Card className="mt-3">
              <CardContent className="flex items-start gap-3 p-3">
                <span className="text-lg shrink-0">{currentBoard.perkIcon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{currentBoard.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentBoard.perk === 'None'
                      ? 'Pure skill — no special abilities'
                      : `${currentBoard.perk} — ${currentBoard.perkDescription}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Start Button */}
        <Button className="w-full" size="lg" onClick={startGame}>
          <Zap className="w-4 h-4" />
          Find Opponent
        </Button>
      </div>
    </div>
  );
}
