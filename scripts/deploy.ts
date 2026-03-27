/**
 * Deploy ChainPongEscrow to Base Sepolia
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/deploy.ts
 *
 * The DEPLOYER wallet will become the contract owner.
 * The RESOLVER_ADDRESS should be your backend's admin wallet.
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RESOLVER_ADDRESS = process.env.RESOLVER_ADDRESS; // Backend admin wallet
const PROTOCOL_FEE_BPS = parseInt(process.env.PROTOCOL_FEE_BPS || '400'); // 4% default

async function main() {
  if (!DEPLOYER_KEY) throw new Error('Set DEPLOYER_PRIVATE_KEY env var');
  if (!RESOLVER_ADDRESS) throw new Error('Set RESOLVER_ADDRESS env var (backend admin wallet)');

  console.log('🚀 Deploying ChainPongEscrow to Base Sepolia...');
  console.log(`   Resolver: ${RESOLVER_ADDRESS}`);
  console.log(`   Fee: ${PROTOCOL_FEE_BPS} bps (${PROTOCOL_FEE_BPS / 100}%)`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  console.log(`   Deployer: ${deployer.address}`);

  const balance = await provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) throw new Error('Deployer has no ETH for gas');

  // Read compiled bytecode + ABI
  const abiPath = path.join(__dirname, '../artifacts/contracts_ChainPongEscrow_sol_ChainPongEscrow.abi');
  const binPath = path.join(__dirname, '../artifacts/contracts_ChainPongEscrow_sol_ChainPongEscrow.bin');

  const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const bytecode = '0x' + fs.readFileSync(binPath, 'utf8').trim();

  // Deploy
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  console.log('\n⏳ Sending deploy transaction...');

  const contract = await factory.deploy(RESOLVER_ADDRESS, PROTOCOL_FEE_BPS);
  console.log(`   Tx: ${contract.deploymentTransaction()?.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\n✅ ChainPongEscrow deployed!`);
  console.log(`   Address: ${address}`);
  console.log(`   BaseScan: https://sepolia.basescan.org/address/${address}`);

  // Save address to .env files
  const envLine = `\nCONTRACT_ADDRESS=${address}\n`;

  // Update backend .env
  const backendEnvPath = path.join(__dirname, '../backend/.env');
  if (fs.existsSync(backendEnvPath)) {
    const content = fs.readFileSync(backendEnvPath, 'utf8');
    if (!content.includes('CONTRACT_ADDRESS')) {
      fs.appendFileSync(backendEnvPath, envLine);
      console.log('   ✅ Added to backend/.env');
    }
  }

  // Create deployment record
  const record = {
    network: 'baseSepolia',
    chainId: 84532,
    address,
    deployer: deployer.address,
    resolver: RESOLVER_ADDRESS,
    feeBps: PROTOCOL_FEE_BPS,
    deployedAt: new Date().toISOString(),
    txHash: contract.deploymentTransaction()?.hash,
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  fs.writeFileSync(
    path.join(deploymentsDir, 'baseSepolia.json'),
    JSON.stringify(record, null, 2)
  );
  console.log('   ✅ Saved to deployments/baseSepolia.json');

  console.log('\n📋 Next steps:');
  console.log('   1. Set CONTRACT_ADDRESS in Vercel env vars (both frontend + backend)');
  console.log('   2. Set NEXT_PUBLIC_CONTRACT_ADDRESS for the frontend');
  console.log('   3. Fund the contract if needed');
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err.message);
  process.exit(1);
});
