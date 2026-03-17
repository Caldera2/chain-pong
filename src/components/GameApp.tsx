'use client';

import { useGameStore } from '@/lib/store';
import SplashScreen from '@/components/SplashScreen';
import Navbar from '@/components/Navbar';
import Lobby from '@/components/Lobby';
import ModeSelect from '@/components/ModeSelect';
import Matchmaking from '@/components/Matchmaking';
import PongGame from '@/components/PongGame';
import Shop from '@/components/Shop';
import Leaderboard from '@/components/Leaderboard';
import Profile from '@/components/Profile';
import Withdraw from '@/components/Withdraw';

export default function GameApp() {
  const screen = useGameStore((s) => s.screen);

  return (
    <main className="min-h-screen">
      <Navbar />
      {screen === 'splash' && <SplashScreen />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'mode-select' && <ModeSelect />}
      {screen === 'matchmaking' && <Matchmaking />}
      {screen === 'game' && <PongGame />}
      {screen === 'shop' && <Shop />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'profile' && <Profile />}
      {screen === 'withdraw' && <Withdraw />}
    </main>
  );
}
