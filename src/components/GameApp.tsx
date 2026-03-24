'use client';

import { useGameStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import SplashScreen from '@/components/SplashScreen';
import Login from '@/components/Login';
import Signup from '@/components/Signup';
import Navbar from '@/components/Navbar';
import Lobby from '@/components/Lobby';
import ModeSelect from '@/components/ModeSelect';
import Matchmaking from '@/components/Matchmaking';
import PongGame from '@/components/PongGame';
import Shop from '@/components/Shop';
import Leaderboard from '@/components/Leaderboard';
import Profile from '@/components/Profile';
import Withdraw from '@/components/Withdraw';
import Deposit from '@/components/Deposit';
import TransactionHistory from '@/components/TransactionHistory';
import ForgotPassword from '@/components/ForgotPassword';
import ResetPassword from '@/components/ResetPassword';
import Tutorial from '@/components/Tutorial';
import Referral from '@/components/Referral';

export default function GameApp() {
  const screen = useGameStore((s) => s.screen);
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Check URL for reset-token parameter on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset-token');
    if (token) {
      setResetToken(token);
    }
  }, []);

  // If there's a reset token in the URL, show the reset password screen
  if (resetToken) {
    return (
      <main className="min-h-screen">
        <ResetPassword token={resetToken} />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Navbar />
      {screen === 'splash' && <SplashScreen />}
      {screen === 'login' && <Login />}
      {screen === 'signup' && <Signup />}
      {screen === 'forgot-password' && <ForgotPassword />}
      {screen === 'tutorial' && <Tutorial />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'mode-select' && <ModeSelect />}
      {screen === 'matchmaking' && <Matchmaking />}
      {screen === 'game' && <PongGame />}
      {screen === 'shop' && <Shop />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'profile' && <Profile />}
      {screen === 'withdraw' && <Withdraw />}
      {screen === 'deposit' && <Deposit />}
      {screen === 'transactions' && <TransactionHistory />}
      {screen === 'referral' && <Referral />}
    </main>
  );
}
