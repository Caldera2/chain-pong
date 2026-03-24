import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

export const config = getDefaultConfig({
  appName: 'Chain Pong',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'chain-pong',
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  ssr: true,
});

// Export the chain for use across the app
export const ACTIVE_CHAIN = base;
export const CHAIN_NAME = 'Base';
export const TOKEN_SYMBOL = 'ETH';
export const IS_TESTNET = false;
export const BLOCK_EXPLORER = 'https://basescan.org';
