'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useBalance } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { config } from '@/lib/wagmi';
import { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store';

function WalletSync() {
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ address });
  const { setConnected, setWalletBalance } = useGameStore();

  useEffect(() => {
    setConnected(isConnected, address);
  }, [isConnected, address, setConnected]);

  useEffect(() => {
    if (balanceData) {
      setWalletBalance(parseFloat(balanceData.formatted));
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
