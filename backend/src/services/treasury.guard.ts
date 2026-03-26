// ─────────────────────────────────────────────────────────
// Chain Pong — Treasury Protection Service
//
// Anti-theft and treasury hardening:
// 1. Circuit breaker — disables payouts if hourly limit exceeded
// 2. Hot wallet monitoring — alerts when balance is low
// 3. Rate limiting on payout execution
// ─────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import { env } from '../config/env';
import { getOnChainBalanceWei } from '../utils/wallet';

// ─── Configuration ───────────────────────────────────────
const CIRCUIT_BREAKER_LIMIT_ETH = parseFloat(process.env.CIRCUIT_BREAKER_LIMIT || '0.5');
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const HOT_WALLET_MIN_ETH = parseFloat(process.env.HOT_WALLET_MIN || '0.05');
const MAX_SINGLE_PAYOUT_ETH = parseFloat(process.env.MAX_SINGLE_PAYOUT || '0.2');

// ─── Payout Tracking (sliding window) ───────────────────

interface PayoutRecord {
  amount: number;
  timestamp: number;
}

class TreasuryGuard {
  private payoutHistory: PayoutRecord[] = [];
  private circuitBreakerTripped = false;
  private circuitBreakerTrippedAt: number | null = null;
  private lastBalanceAlert: number = 0;
  private readonly ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min between alerts

  // ─── Circuit Breaker ─────────────────────────────────
  // Trips if total payouts in the last hour exceed the limit.
  // Once tripped, ALL payouts are blocked until manual reset
  // or 1 hour has passed since the trip.

  private getRecentPayouts(): number {
    const cutoff = Date.now() - CIRCUIT_BREAKER_WINDOW_MS;
    this.payoutHistory = this.payoutHistory.filter((p) => p.timestamp > cutoff);
    return this.payoutHistory.reduce((sum, p) => sum + p.amount, 0);
  }

  recordPayout(amountEth: number): void {
    this.payoutHistory.push({ amount: amountEth, timestamp: Date.now() });
  }

  isCircuitBreakerTripped(): boolean {
    // Auto-reset after 1 hour
    if (this.circuitBreakerTripped && this.circuitBreakerTrippedAt) {
      if (Date.now() - this.circuitBreakerTrippedAt > CIRCUIT_BREAKER_WINDOW_MS) {
        console.warn('[TREASURY] Circuit breaker auto-reset after 1 hour cooldown');
        this.circuitBreakerTripped = false;
        this.circuitBreakerTrippedAt = null;
      }
    }
    return this.circuitBreakerTripped;
  }

  private tripCircuitBreaker(reason: string): void {
    this.circuitBreakerTripped = true;
    this.circuitBreakerTrippedAt = Date.now();

    const recentTotal = this.getRecentPayouts();

    // ── ALERT ──
    console.error('═══════════════════════════════════════════════════');
    console.error('[TREASURY] 🚨 CIRCUIT BREAKER TRIPPED');
    console.error(`[TREASURY] Reason: ${reason}`);
    console.error(`[TREASURY] Total payouts in last hour: ${recentTotal.toFixed(6)} ETH`);
    console.error(`[TREASURY] Limit: ${CIRCUIT_BREAKER_LIMIT_ETH} ETH`);
    console.error(`[TREASURY] All payouts DISABLED until manual reset or 1hr cooldown`);
    console.error('═══════════════════════════════════════════════════');

    // In production, this would send an email/Slack/PagerDuty alert
    // For now, we log prominently. The env var ALERT_WEBHOOK_URL can be
    // used to POST to a webhook endpoint.
    this.sendAlert(`CIRCUIT BREAKER TRIPPED: ${reason}. Total hourly payouts: ${recentTotal.toFixed(6)} ETH`);
  }

  manualReset(): void {
    this.circuitBreakerTripped = false;
    this.circuitBreakerTrippedAt = null;
    this.payoutHistory = [];
    console.warn('[TREASURY] Circuit breaker manually reset');
  }

  // ─── Pre-Payout Validation ───────────────────────────
  // Called BEFORE every payout. Returns { allowed, reason }.

  async prePayoutCheck(amountEth: number): Promise<{ allowed: boolean; reason?: string }> {
    // Check 1: Circuit breaker
    if (this.isCircuitBreakerTripped()) {
      return { allowed: false, reason: 'Circuit breaker is active — payouts disabled' };
    }

    // Check 2: Single payout size limit
    if (amountEth > MAX_SINGLE_PAYOUT_ETH) {
      this.tripCircuitBreaker(`Single payout of ${amountEth} ETH exceeds max of ${MAX_SINGLE_PAYOUT_ETH} ETH`);
      return { allowed: false, reason: `Payout ${amountEth} ETH exceeds single-transaction limit of ${MAX_SINGLE_PAYOUT_ETH} ETH` };
    }

    // Check 3: Hourly cumulative limit
    const recentTotal = this.getRecentPayouts();
    if (recentTotal + amountEth > CIRCUIT_BREAKER_LIMIT_ETH) {
      this.tripCircuitBreaker(`Hourly payout total (${(recentTotal + amountEth).toFixed(6)} ETH) would exceed limit`);
      return {
        allowed: false,
        reason: `Hourly payout limit would be exceeded: ${recentTotal.toFixed(6)} + ${amountEth} > ${CIRCUIT_BREAKER_LIMIT_ETH} ETH`,
      };
    }

    // Check 4: Treasury balance check + hot wallet alert
    await this.checkBalance();

    return { allowed: true };
  }

  // ─── Hot Wallet Balance Monitor ──────────────────────
  // Checks if treasury balance is below the minimum threshold.
  // Alerts with a cooldown to avoid spam.

  async checkBalance(): Promise<void> {
    try {
      const balanceWei = await getOnChainBalanceWei(env.TREASURY_ADDRESS);
      const balanceEth = Number(ethers.formatEther(balanceWei));

      if (balanceEth < HOT_WALLET_MIN_ETH) {
        const now = Date.now();
        if (now - this.lastBalanceAlert > this.ALERT_COOLDOWN_MS) {
          this.lastBalanceAlert = now;

          console.warn('═══════════════════════════════════════════════════');
          console.warn('[TREASURY] ⚠️ LOW BALANCE ALERT');
          console.warn(`[TREASURY] Current balance: ${balanceEth.toFixed(6)} ETH`);
          console.warn(`[TREASURY] Minimum threshold: ${HOT_WALLET_MIN_ETH} ETH`);
          console.warn(`[TREASURY] ACTION REQUIRED: Top up treasury from cold wallet`);
          console.warn(`[TREASURY] Treasury address: ${env.TREASURY_ADDRESS}`);
          console.warn('═══════════════════════════════════════════════════');

          this.sendAlert(`LOW BALANCE: Treasury has ${balanceEth.toFixed(6)} ETH. Minimum: ${HOT_WALLET_MIN_ETH} ETH. Top up required.`);
        }
      }
    } catch (err: any) {
      console.error('[TREASURY] Failed to check balance:', err.message);
    }
  }

  // ─── Alert Dispatcher ────────────────────────────────
  // Sends alerts via webhook if configured, otherwise logs.

  private sendAlert(message: string): void {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      // Fire-and-forget webhook POST
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[Chain Pong Treasury] ${message}`,
          timestamp: new Date().toISOString(),
          treasuryAddress: env.TREASURY_ADDRESS,
        }),
      }).catch((err) => {
        console.error('[TREASURY] Failed to send webhook alert:', err.message);
      });
    }

    // Always log to stdout for platform logging (Render, Railway, etc.)
    console.log(`[TREASURY ALERT] ${new Date().toISOString()} — ${message}`);
  }

  // ─── Status (for health endpoint / admin) ────────────

  getStatus(): {
    circuitBreakerActive: boolean;
    recentPayoutsEth: number;
    hourlyLimit: number;
    maxSinglePayout: number;
    hotWalletMinimum: number;
    payoutsInWindow: number;
  } {
    const recentTotal = this.getRecentPayouts();
    return {
      circuitBreakerActive: this.isCircuitBreakerTripped(),
      recentPayoutsEth: parseFloat(recentTotal.toFixed(8)),
      hourlyLimit: CIRCUIT_BREAKER_LIMIT_ETH,
      maxSinglePayout: MAX_SINGLE_PAYOUT_ETH,
      hotWalletMinimum: HOT_WALLET_MIN_ETH,
      payoutsInWindow: this.payoutHistory.length,
    };
  }
}

// Singleton — one guard instance per process
export const treasuryGuard = new TreasuryGuard();
