'use client';

import { useGameStore } from '@/lib/store';
import { IS_TESTNET, CHAIN_NAME, TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect, useState } from 'react';
import { apiGetMatch, apiCancelMatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Trophy, TrendingUp, TrendingDown, Wallet, ArrowRight,
  Gamepad2, ShoppingBag, Users, User, Swords, X, Play
} from 'lucide-react';

interface ActiveMatch {
  matchId: string;
  board: string;
  stake: number;
  timestamp: number;
}

export default function Lobby() {
  const {
    setScreen, wins, losses, totalEarnings, totalLost, walletBalance, balance,
    username, leaderboard, authMethod, gameWallet,
    fetchLeaderboard, syncFromBackend, setCurrentMatchId, setPvpStakeAmount, setSelectedBoard
  } = useGameStore();
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);

  useEffect(() => {
    syncFromBackend();
    fetchLeaderboard();
  }, [syncFromBackend, fetchLeaderboard]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chainpong-active-match');
      if (saved) {
        const match: ActiveMatch = JSON.parse(saved);
        if (Date.now() - match.timestamp < 30 * 60 * 1000) {
          apiGetMatch(match.matchId).then((res) => {
            if (res.success && res.data) {
              const status = (res.data as any).status;
              if (['PENDING', 'MATCHED', 'IN_PROGRESS'].includes(status)) {
                setActiveMatch(match);
              } else {
                localStorage.removeItem('chainpong-active-match');
              }
            } else {
              localStorage.removeItem('chainpong-active-match');
            }
          }).catch(() => localStorage.removeItem('chainpong-active-match'));
        } else {
          localStorage.removeItem('chainpong-active-match');
        }
      }
    } catch {}
  }, []);

  const handleResumeMatch = () => {
    if (!activeMatch) return;
    setCurrentMatchId(activeMatch.matchId);
    setPvpStakeAmount(activeMatch.stake);
    setSelectedBoard(activeMatch.board);
    setScreen('game');
  };

  const handleDismissMatch = async () => {
    if (activeMatch) {
      try { await apiCancelMatch(activeMatch.matchId); } catch {}
    }
    localStorage.removeItem('chainpong-active-match');
    setActiveMatch(null);
    setCurrentMatchId(null);
  };

  const netEarnings = totalEarnings - totalLost;
  const effectiveBalance = authMethod === 'wallet' ? walletBalance : balance;

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-1">
            {IS_TESTNET && (
              <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">
                {CHAIN_NAME} Testnet
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </Badge>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome back, <span className="text-primary">{username}</span>
          </h1>
          {authMethod === 'email' && gameWallet && (
            <p className="text-muted-foreground text-xs font-mono mt-1">
              {gameWallet.slice(0, 6)}...{gameWallet.slice(-4)}
            </p>
          )}
        </div>

        {/* Active Match Banner */}
        {activeMatch && (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Swords className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Active Match</p>
                  <p className="text-xs text-muted-foreground">Stake: {activeMatch.stake} {TOKEN_SYMBOL}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleDismissMatch}>
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={handleResumeMatch}>Resume</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Wins</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-emerald-400 font-heading">{wins}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Losses</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-red-400 font-heading">{losses}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Earned</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-primary font-heading">{totalEarnings.toFixed(4)}</p>
              <p className="text-[10px] text-muted-foreground">{TOKEN_SYMBOL}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Balance</span>
              </div>
              <p className={`text-lg sm:text-2xl font-bold font-heading ${netEarnings >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                {effectiveBalance.toFixed(4)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Net: {netEarnings >= 0 ? '+' : ''}{netEarnings.toFixed(4)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Primary Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setScreen('mode-select')}
            className="group relative text-left rounded-xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Play className="w-5 h-5 text-primary" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <h2 className="font-heading text-lg font-semibold mb-1">Play & Stake</h2>
            <p className="text-sm text-muted-foreground">Challenge players — winner takes the pot</p>
          </button>

          <button
            onClick={() => setScreen('shop')}
            className="group relative text-left rounded-xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.02]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-violet-400" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h2 className="font-heading text-lg font-semibold mb-1">Skill Shop</h2>
            <p className="text-sm text-muted-foreground">Boards with unique gameplay perks</p>
          </button>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Champions', icon: Trophy, screen: 'leaderboard' as const },
            { label: 'Claim', icon: TrendingUp, screen: 'withdraw' as const },
            { label: 'Invite', icon: Users, screen: 'referral' as const },
            { label: 'Profile', icon: User, screen: 'profile' as const },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setScreen(item.screen)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            >
              <item.icon className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Leaderboard Preview */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Top Players
              </h3>
              <button
                onClick={() => setScreen('leaderboard')}
                className="text-xs text-primary hover:underline font-medium"
              >
                View All
              </button>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No players ranked yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Be the first to compete</p>
              </div>
            ) : (
              <div className="space-y-1">
                {leaderboard.slice(0, 5).map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center justify-between py-2 px-2.5 rounded-lg text-sm ${
                      entry.isPlayer ? 'bg-primary/[0.04]' : 'hover:bg-muted/50'
                    } transition-colors`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
                        entry.rank === 1 ? 'bg-yellow-500/10 text-yellow-400' :
                        entry.rank === 2 ? 'bg-zinc-400/10 text-zinc-300' :
                        entry.rank === 3 ? 'bg-amber-600/10 text-amber-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {entry.rank}
                      </span>
                      <span className="text-base">{entry.avatar}</span>
                      <span className={`font-medium text-sm truncate ${entry.isPlayer ? 'text-primary' : ''}`}>
                        {entry.username}{entry.isPlayer ? ' (You)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                      <span className="text-emerald-400 font-medium">{entry.wins}W</span>
                      <span className="text-primary font-medium hidden sm:inline">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
