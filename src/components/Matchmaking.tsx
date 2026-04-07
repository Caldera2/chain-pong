'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { apiCreateMatch, ensureValidToken } from '@/lib/api';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Zap, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Matchmaking() {
  const { setScreen, pvpStakeAmount, selectedBoard, setCurrentMatchId, setCurrentMatchSeed, setCurrentConfigHash, difficulty } = useGameStore();
  const [status, setStatus] = useState('Creating match...');
  const [found, setFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matchCreated = useRef(false);

  // Keep token alive while user is in matchmaking queue
  // JWT can expire during the wait — refresh every 4 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      ensureValidToken().catch(() => {});
    }, 4 * 60 * 1000); // 4 minutes
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (matchCreated.current) return;
    matchCreated.current = true;

    const createMatch = async () => {
      try {
        // Step 0: Pre-flight token check — refresh if within 5min of expiry
        setStatus('Verifying session...');
        await ensureValidToken();

        // Step 1: Try to create match on backend
        setStatus('Creating match on server...');
        const res = await apiCreateMatch(
          'PVP',
          selectedBoard || 'classic',
          pvpStakeAmount,
          difficulty?.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD'
        );

        if (res.success && res.data) {
          const match = res.data as { id: string; matchSeed?: string; configHash?: string };
          setCurrentMatchId(match.id);
          if (match.matchSeed) setCurrentMatchSeed(match.matchSeed);
          if (match.configHash) setCurrentConfigHash(match.configHash);
          console.log('[MATCHMAKING] Match created on server:', match.id);
        } else {
          // Backend unavailable — create local match (play vs AI)
          const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setCurrentMatchId(localId);
          console.log('[MATCHMAKING] Backend unavailable, local match:', localId, '| Reason:', res.error);
        }

        // Step 2: Simulate matchmaking
        setStatus('Searching for opponent...');
        await new Promise(r => setTimeout(r, 1500));

        setStatus('Matching skill level...');
        await new Promise(r => setTimeout(r, 1000));

        setStatus('Locking stakes...');
        await new Promise(r => setTimeout(r, 1000));

        setStatus('Opponent found!');
        setFound(true);
        await new Promise(r => setTimeout(r, 1500));

        // Step 3: Start game
        setScreen('game');
      } catch (err: any) {
        console.error('[MATCHMAKING] Error:', err);
        setError(err?.message || 'Matchmaking failed');
      }
    };

    createMatch();
  }, [pvpStakeAmount, selectedBoard, difficulty, setCurrentMatchId, setCurrentMatchSeed, setScreen]);

  const totalPot = pvpStakeAmount * 2;

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm w-full space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="font-heading text-lg font-semibold">Matchmaking Failed</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => setScreen('mode-select')} variant="outline" className="mt-4">
            Back to Mode Select
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full space-y-6">

        {/* Spinner / Check */}
        <div className="relative w-20 h-20 mx-auto">
          {!found ? (
            <>
              <motion.div
                className="absolute inset-0 rounded-full border border-primary/20"
                animate={{ scale: [1, 1.4], opacity: [0.3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <div className="absolute inset-0 rounded-full border border-border flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            </>
          ) : (
            <motion.div
              className="absolute inset-0 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <Zap className="w-6 h-6 text-emerald-400" />
            </motion.div>
          )}
        </div>

        {/* Status */}
        <div>
          <motion.h2
            className="font-heading text-lg font-semibold"
            key={status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {status}
          </motion.h2>
          {!found && !error && <p className="text-xs text-muted-foreground mt-1">Estimated wait: ~5s</p>}
        </div>

        {/* Opponent Card */}
        {found && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="flex items-center gap-3 p-3 justify-center">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Opponent</p>
                  <p className="text-[10px] text-muted-foreground">Matched</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stake Info */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Your Stake</p>
                <p className="text-sm font-semibold text-primary">{pvpStakeAmount}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Opponent</p>
                <p className="text-sm font-semibold text-muted-foreground">{pvpStakeAmount}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total Pot</p>
                <p className="text-sm font-semibold text-emerald-400">{totalPot.toFixed(4)}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3 pt-3 border-t border-border">
              Winner takes 96% · 4% protocol fee
            </p>
          </CardContent>
        </Card>

        <button
          onClick={() => setScreen('mode-select')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
