import { http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

export const config = getDefaultConfig({
  appName: 'Chain Pong',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '308d9a88df2c8699d6a2ea6a190a6bce',
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
  ssr: true,
});

// Export the chain for use across the app
export const ACTIVE_CHAIN = baseSepolia;
export const CHAIN_NAME = 'Base Sepolia';
export const TOKEN_SYMBOL = 'ETH';
export const IS_TESTNET = true;
export const BLOCK_EXPLORER = 'https://sepolia.basescan.org';
