'use client';

import { useGameStore } from '@/lib/store';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, ArrowLeft, Medal, Crown, Award } from 'lucide-react';

export default function Leaderboard() {
  const { leaderboard, setScreen, username, wins, losses, totalEarnings, playerRank, isLoggedIn, fetchLeaderboard } = useGameStore();

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const hasPlayers = leaderboard.length > 0;

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ranked by total wins</p>
        </div>

        {/* Empty State */}
        {!hasPlayers && (
          <Card>
            <CardContent className="py-16 text-center">
              <Trophy className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <h2 className="font-heading text-lg font-semibold mb-1">No Rankings Yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Be the first player to compete and claim the top spot.
              </p>
              <Button onClick={() => setScreen('mode-select')}>Play Now</Button>
            </CardContent>
          </Card>
        )}

        {/* Top 3 Podium */}
        {leaderboard.length >= 3 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { entry: leaderboard[1], pos: '2nd', Icon: Medal, accent: 'text-zinc-300', accentBg: 'bg-zinc-400/10', accentBorder: 'border-zinc-400/20' },
              { entry: leaderboard[0], pos: '1st', Icon: Crown, accent: 'text-amber-400', accentBg: 'bg-amber-400/10', accentBorder: 'border-amber-400/20' },
              { entry: leaderboard[2], pos: '3rd', Icon: Award, accent: 'text-orange-400', accentBg: 'bg-orange-400/10', accentBorder: 'border-orange-400/20' },
            ].map(({ entry, pos, Icon, accent, accentBg, accentBorder }) => (
              <Card
                key={entry.rank}
                className={`text-center ${entry.isPlayer ? 'border-primary/20' : ''}`}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className={`w-8 h-8 rounded-lg ${accentBg} border ${accentBorder} mx-auto mb-2 flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${accent}`} />
                  </div>
                  <span className="text-xl mb-1 block">{entry.avatar}</span>
                  <p className={`text-xs sm:text-sm font-semibold truncate ${entry.isPlayer ? 'text-primary' : ''}`}>
                    {entry.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{entry.wins}W / {entry.losses}L</p>
                  <p className={`text-xs font-semibold mt-1 ${accent}`}>{pos}</p>
                  <p className="text-[10px] text-muted-foreground">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Your Rank */}
        {isLoggedIn && hasPlayers && (
          <Card className="border-primary/15 bg-primary/[0.02]">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="font-heading font-bold text-sm text-primary">#{playerRank}</span>
                </div>
                <div>
                  <p className="font-medium text-sm">{username} <span className="text-primary text-xs">(You)</span></p>
                  <p className="text-xs text-muted-foreground">{wins}W / {losses}L</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-primary font-semibold text-sm">{totalEarnings.toFixed(3)}</p>
                <p className="text-[10px] text-muted-foreground">{TOKEN_SYMBOL} earned</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full List */}
        {hasPlayers && (
          <Card className="overflow-hidden">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-widest font-medium border-b border-border">
              <div className="col-span-1">Rank</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-2 text-center">Wins</div>
              <div className="col-span-1 text-center">Losses</div>
              <div className="col-span-3 text-right">Earnings</div>
            </div>

            {leaderboard.map((entry) => {
              const isYou = entry.isPlayer;
              return (
                <div
                  key={`${entry.username}-${entry.rank}`}
                  className={`border-b border-border/50 last:border-0 transition-colors ${
                    isYou ? 'bg-primary/[0.03]' : 'hover:bg-muted/30'
                  }`}
                >
                  {/* Desktop */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 items-center">
                    <div className="col-span-1">
                      <span className={`text-sm font-bold ${
                        entry.rank === 1 ? 'text-amber-400' :
                        entry.rank === 2 ? 'text-zinc-300' :
                        entry.rank === 3 ? 'text-orange-400' :
                        isYou ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {entry.rank}
                      </span>
                    </div>
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <span className="text-base">{entry.avatar}</span>
                      <div className="min-w-0">
                        <span className={`text-sm font-medium truncate block ${isYou ? 'text-primary' : ''}`}>
                          {entry.username}{isYou ? ' (You)' : ''}
                        </span>
                        {entry.address && (
                          <span className="text-[10px] text-muted-foreground/50 font-mono block truncate">{entry.address}</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 text-center text-emerald-400 font-medium text-sm">{entry.wins}</div>
                    <div className="col-span-1 text-center text-muted-foreground text-sm">{entry.losses}</div>
                    <div className="col-span-3 text-right text-primary font-medium text-sm">{entry.earnings.toFixed(3)} {TOKEN_SYMBOL}</div>
                  </div>

                  {/* Mobile */}
                  <div className="sm:hidden flex items-center gap-2.5 px-3 py-2.5">
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-amber-400/10 text-amber-400' :
                      entry.rank === 2 ? 'bg-zinc-400/10 text-zinc-300' :
                      entry.rank === 3 ? 'bg-orange-400/10 text-orange-400' :
                      isYou ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="text-base shrink-0">{entry.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <span className={`text-sm font-medium truncate block ${isYou ? 'text-primary' : ''}`}>
                        {entry.username}{isYou ? ' (You)' : ''}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{entry.wins}W / {entry.losses}L</span>
                    </div>
                    <span className="text-primary font-medium text-xs shrink-0">{entry.earnings.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
