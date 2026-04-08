'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useBalance, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { config, ACTIVE_CHAIN } from '@/lib/wagmi';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/lib/store';
import { apiGetNonce, apiWalletAuth } from '@/lib/api';

// Track whether the user explicitly clicked a wallet-connect button.
// This prevents MetaMask from popping up on page load when Wagmi
// auto-reconnects from a previous session.
const WALLET_INTENT_KEY = 'chainpong-wallet-intent';

export function markWalletIntent() {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(WALLET_INTENT_KEY, Date.now().toString());
  }
}

function consumeWalletIntent(): boolean {
  if (typeof window === 'undefined') return false;
  const ts = sessionStorage.getItem(WALLET_INTENT_KEY);
  if (!ts) return false;
  sessionStorage.removeItem(WALLET_INTENT_KEY);
  // Intent is valid for 2 minutes (covers MetaMask popup delay)
  return Date.now() - Number(ts) < 120_000;
}

function WalletSync() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { data: balanceData } = useBalance({ address, chainId: ACTIVE_CHAIN.id, query: { refetchInterval: 10000 } });
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { setConnected, setWalletBalance, isLoggedIn, authMethod, login, screen } = useGameStore();
  const prevLoggedIn = useRef(isLoggedIn);
  const authInProgress = useRef(false);
  const isLoggedInRef = useRef(isLoggedIn);
  const chainSwitchAttempted = useRef(false);
  // True only when the current connection was initiated by a user click
  const userInitiated = useRef(false);
  isLoggedInRef.current = isLoggedIn;

  // On mount, check if there's a pending wallet intent from a button click
  useEffect(() => {
    if (consumeWalletIntent()) {
      userInitiated.current = true;
    }
  }, []);

  useEffect(() => {
    setConnected(isConnected, address);
  }, [isConnected, address, setConnected]);

  // Auto-switch wallet to Base Sepolia if on wrong chain — but only
  // if the user explicitly connected (not on passive reconnect)
  useEffect(() => {
    if (isConnected && walletChainId && walletChainId !== ACTIVE_CHAIN.id
        && !chainSwitchAttempted.current && userInitiated.current) {
      chainSwitchAttempted.current = true;
      switchChainAsync({ chainId: ACTIVE_CHAIN.id })
        .then(() => {
          console.log(`[WALLET] Switched to ${ACTIVE_CHAIN.name}`);
        })
        .catch((err) => {
          console.warn('[WALLET] Chain switch failed:', err?.message);
        })
        .finally(() => {
          setTimeout(() => { chainSwitchAttempted.current = false; }, 10000);
        });
    }
  }, [isConnected, walletChainId, switchChainAsync]);

  // Wallet auth — only triggered by explicit user gesture, never on passive reconnect.
  // Email-authenticated users never enter this flow.
  const handleWalletAuth = useCallback(async (walletAddress: string) => {
    if (authInProgress.current) return;
    authInProgress.current = true;

    try {
      const nonceRes = await apiGetNonce(walletAddress);
      if (!nonceRes.success || !nonceRes.data) {
        const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        login(`${shortAddr}@wallet`, shortAddr, 'wallet');
        return;
      }

      const { nonce, message } = nonceRes.data;
      const signature = await signMessageAsync({ message });

      const authRes = await apiWalletAuth(walletAddress, signature, message);
      if (authRes.success && authRes.data) {
        const user = authRes.data.user;
        login(
          user.email || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}@wallet`,
          user.username,
          'wallet'
        );
      } else {
        const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        login(`${shortAddr}@wallet`, shortAddr, 'wallet');
      }
    } catch (err: any) {
      console.warn('Wallet auth failed:', err?.message);
      const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      login(`${shortAddr}@wallet`, shortAddr, 'wallet');
    } finally {
      authInProgress.current = false;
    }
  }, [signMessageAsync, login]);

  // Only trigger wallet auth when:
  // 1. User explicitly clicked a wallet-connect button (userInitiated)
  // 2. Not already logged in
  // 3. On an auth screen (login/signup)
  // 4. NOT an email-authenticated user (prevents MetaMask for custodial users)
  useEffect(() => {
    if (isConnected && address && !isLoggedIn && userInitiated.current
        && (screen === 'login' || screen === 'signup') && authMethod !== 'email') {
      handleWalletAuth(address);
      // Consumed — don't re-trigger on subsequent renders
      userInitiated.current = false;
    }
  }, [isConnected, address, isLoggedIn, screen, authMethod, handleWalletAuth]);

  // When the RainbowKit modal connects (after user clicks), mark it as user-initiated
  useEffect(() => {
    if (isConnected && !isLoggedIn && !userInitiated.current) {
      // Check for a fresh intent that arrived while the modal was open
      if (consumeWalletIntent()) {
        userInitiated.current = true;
      }
    }
  }, [isConnected, isLoggedIn]);

  // Disconnect wallet when user logs out
  useEffect(() => {
    if (prevLoggedIn.current && !isLoggedIn && isConnected) {
      disconnect();
    }
    prevLoggedIn.current = isLoggedIn;
  }, [isLoggedIn, isConnected, disconnect]);

  useEffect(() => {
    if (balanceData) {
      const val = Number(balanceData.value) / 10 ** balanceData.decimals;
      setWalletBalance(val);
    }
  }, [balanceData, setWalletBalance]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#0052ff',
            accentColorForeground: 'white',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          <WalletSync />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
