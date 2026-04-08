'use client';

import { useGameStore } from '@/lib/store';
import { useEffect, useState, useRef } from 'react';
import { apiHealthCheck } from '@/lib/api';
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
  const [serverDown, setServerDown] = useState(false);
  const failCount = useRef(0);

  // Heartbeat: check server health every 30s on auth screens.
  // Shows a banner if the server is unreachable so users know before they try to sign up.
  useEffect(() => {
    if (screen !== 'login' && screen !== 'signup') {
      setServerDown(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const { ok } = await apiHealthCheck();
      if (cancelled) return;
      if (!ok) {
        failCount.current++;
        // Show banner after 2 consecutive failures to avoid false positives
        if (failCount.current >= 2) setServerDown(true);
      } else {
        failCount.current = 0;
        setServerDown(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [screen]);

  // Check URL for reset-token and referral parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset-token');
    if (token) {
      setResetToken(token);
    }
    // Handle referral link: ?ref=username
    const ref = params.get('ref');
    if (ref) {
      useGameStore.getState().setReferralCode(ref);
      useGameStore.getState().setScreen('signup');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
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
      {serverDown && (
        <div className="bg-destructive/90 text-white text-center text-sm py-2 px-4">
          Server unreachable — signup and login may not work right now. Retrying...
        </div>
      )}
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
