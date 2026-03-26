'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { TOKEN_SYMBOL } from '@/lib/wagmi';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Zap, User } from 'lucide-react';

export default function Matchmaking() {
  const { setScreen, pvpStakeAmount } = useGameStore();
  const [status, setStatus] = useState('Searching for opponent...');
  const [found, setFound] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStatus('Matching skill level...'), 1500);
    const t2 = setTimeout(() => setStatus('Locking stakes...'), 2500);
    const t3 = setTimeout(() => {
      setStatus('Opponent found!');
      setFound(true);
    }, 3500);
    const t4 = setTimeout(() => setScreen('game'), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [setScreen]);

  const totalPot = pvpStakeAmount * 2;

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
          {!found && <p className="text-xs text-muted-foreground mt-1">Estimated wait: ~3s</p>}
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
                  <p className="text-sm font-medium">BaseChamp</p>
                  <p className="text-[10px] text-muted-foreground">298W / 45L</p>
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
              Winner takes the full pot
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
