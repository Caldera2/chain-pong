'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useBalance, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { config, ACTIVE_CHAIN } from '@/lib/wagmi';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/lib/store';
import { apiGetNonce, apiWalletAuth } from '@/lib/api';

function WalletSync() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { data: balanceData } = useBalance({ address, chainId: ACTIVE_CHAIN.id, query: { refetchInterval: 10000 } });
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { setConnected, setWalletBalance, isLoggedIn, login, screen } = useGameStore();
  const prevLoggedIn = useRef(isLoggedIn);
  const authInProgress = useRef(false);
  const isLoggedInRef = useRef(isLoggedIn);
  const chainSwitchAttempted = useRef(false);
  isLoggedInRef.current = isLoggedIn;

  useEffect(() => {
    setConnected(isConnected, address);
  }, [isConnected, address, setConnected]);

  // Auto-switch wallet to Base Sepolia if on wrong chain
  useEffect(() => {
    if (isConnected && walletChainId && walletChainId !== ACTIVE_CHAIN.id && !chainSwitchAttempted.current) {
      chainSwitchAttempted.current = true;
      switchChainAsync({ chainId: ACTIVE_CHAIN.id })
        .then(() => {
          console.log(`[WALLET] Switched to ${ACTIVE_CHAIN.name}`);
        })
        .catch((err) => {
          console.warn('[WALLET] Chain switch failed:', err?.message);
        })
        .finally(() => {
          // Reset after a delay so it can retry if user switches back
          setTimeout(() => { chainSwitchAttempted.current = false; }, 10000);
        });
    }
  }, [isConnected, walletChainId, switchChainAsync]);

  // Auto-login when wallet connects on auth screens — via backend
  const handleWalletAuth = useCallback(async (walletAddress: string) => {
    if (authInProgress.current) return;
    authInProgress.current = true;

    try {
      // Step 1: Get a nonce/message from the backend
      const nonceRes = await apiGetNonce(walletAddress);
      if (!nonceRes.success || !nonceRes.data) {
        // Backend unavailable — fall back to local wallet login
        const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        login(`${shortAddr}@wallet`, shortAddr, 'wallet');
        return;
      }

      // Step 2: Ask the user to sign the message
      const { nonce, message } = nonceRes.data;
      const signature = await signMessageAsync({ message });

      // Step 3: Send the signature to the backend for verification + login/signup
      const authRes = await apiWalletAuth(walletAddress, signature, message);
      if (authRes.success && authRes.data) {
        // Backend authenticated — use the username stored in the database
        const user = authRes.data.user;
        login(
          user.email || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}@wallet`,
          user.username,
          'wallet'
        );
      } else {
        // Backend rejected — fall back to local
        const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        login(`${shortAddr}@wallet`, shortAddr, 'wallet');
      }
    } catch (err: any) {
      // User rejected signature or network error — fall back to local
      console.warn('Wallet auth failed:', err?.message);
      const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      login(`${shortAddr}@wallet`, shortAddr, 'wallet');
    } finally {
      authInProgress.current = false;
    }
  }, [signMessageAsync, login]);

  useEffect(() => {
    if (isConnected && address && !isLoggedIn && (screen === 'login' || screen === 'signup')) {
      handleWalletAuth(address);
    }
  }, [isConnected, address, isLoggedIn, screen, handleWalletAuth]);

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
