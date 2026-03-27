import type { HardhatUserConfig } from 'hardhat/config';

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x' + '00'.repeat(32);

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    baseSepolia: {
      url: 'https://sepolia.base.org',
      chainId: 84532,
      accounts: [DEPLOYER_KEY],
    },
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },
};

export default config;
