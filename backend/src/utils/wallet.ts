import { ethers } from 'ethers';
import crypto from 'crypto';
import { env } from '../config/env';

// ─────────────────────────────────────────────────────────
// Provider (cached singleton per invocation)
// ─────────────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(env.RPC_URL, env.CHAIN_ID);
  }
  return _provider;
}

// ─────────────────────────────────────────────────────────
// AES-256-GCM encryption for private keys
// Uses JWT_SECRET as the encryption passphrase
// ─────────────────────────────────────────────────────────

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function deriveEncryptionKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(env.JWT_SECRET, salt, 100000, KEY_LENGTH, 'sha512');
}

export function encryptPrivateKey(privateKey: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveEncryptionKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: salt:iv:tag:ciphertext (all hex)
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted,
  ].join(':');
}

export function decryptPrivateKey(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted key format');

  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const ciphertext = parts[3];

  const key = deriveEncryptionKey(salt);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─────────────────────────────────────────────────────────
// Real wallet generation — BIP-39 mnemonic + HD wallet
// Creates a standard Ethereum wallet identical to MetaMask
// ─────────────────────────────────────────────────────────

export interface GeneratedWallet {
  address: string;
  privateKey: string;
  mnemonic: string; // 12-word seed phrase
  encryptedKey: string; // AES-encrypted private key for DB storage
}

export function generateGameWallet(): GeneratedWallet {
  // Create a real random HD wallet (same as MetaMask "Create Wallet")
  const wallet = ethers.Wallet.createRandom();

  if (!wallet.mnemonic) {
    throw new Error('Failed to generate mnemonic');
  }

  const encryptedKey = encryptPrivateKey(wallet.privateKey);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase,
    encryptedKey,
  };
}

// ─────────────────────────────────────────────────────────
// Recover wallet signer from encrypted key stored in DB
// Private key is decrypted in memory, never written to disk
// ─────────────────────────────────────────────────────────

export function getGameWalletSigner(encryptedKey: string): ethers.Wallet {
  const privateKey = decryptPrivateKey(encryptedKey);
  return new ethers.Wallet(privateKey, getProvider());
}

// ─────────────────────────────────────────────────────────
// Recover wallet from mnemonic (for user-side import)
// ─────────────────────────────────────────────────────────

export function walletFromMnemonic(mnemonic: string): { address: string; privateKey: string } {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return { address: wallet.address, privateKey: wallet.privateKey };
}

// ─────────────────────────────────────────────────────────
// Treasury signer (resolver for contract settlement)
// ─────────────────────────────────────────────────────────

export function getTreasurySigner(): ethers.Wallet | null {
  if (!env.TREASURY_PRIVATE_KEY) return null;
  return new ethers.Wallet(env.TREASURY_PRIVATE_KEY, getProvider());
}

// ─────────────────────────────────────────────────────────
// On-chain helpers
// ─────────────────────────────────────────────────────────

/** Get on-chain ETH balance in ether (string) */
export async function getOnChainBalance(address: string): Promise<string> {
  try {
    const balance = await getProvider().getBalance(address);
    return ethers.formatEther(balance);
  } catch {
    return '0';
  }
}

/** Get on-chain ETH balance in wei (bigint) */
export async function getOnChainBalanceWei(address: string): Promise<bigint> {
  try {
    return await getProvider().getBalance(address);
  } catch {
    return 0n;
  }
}

/** Estimate gas cost for a simple ETH transfer on Base */
export async function estimateTransferGas(): Promise<bigint> {
  try {
    const provider = getProvider();
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
    return gasPrice * 21000n; // 21000 = gas limit for simple ETH transfer
  } catch {
    return ethers.parseEther('0.0001'); // fallback estimate
  }
}

// ─────────────────────────────────────────────────────────
// Wallet signature verification (for wallet-based auth)
// ─────────────────────────────────────────────────────────

export function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// Generate a nonce message for wallet auth
export function generateAuthMessage(address: string, nonce: string): string {
  return `Sign this message to log in to Chain Pong.\n\nWallet: ${address}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
}
