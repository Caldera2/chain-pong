import { QueueEntry } from '../types';

// ─────────────────────────────────────────────────────────
// In-Memory Matchmaking Queue
// Groups players by stake tier, matches by closest ELO rating
// ─────────────────────────────────────────────────────────

class MatchmakingQueue {
  // stakeAmount → queue of waiting players
  private queues: Map<number, QueueEntry[]> = new Map();
  // userId → queue entry (for quick lookup/removal)
  private playerMap: Map<string, QueueEntry> = new Map();

  // Rating tolerance expands over time
  private readonly BASE_TOLERANCE = 200;
  private readonly TOLERANCE_PER_SEC = 10;
  private readonly MAX_TOLERANCE = 1000;

  /**
   * Add a player to the queue. Returns a matched opponent if found immediately.
   */
  join(entry: QueueEntry): QueueEntry | null {
    // Don't allow duplicate entries
    if (this.playerMap.has(entry.userId)) {
      this.leave(entry.userId);
    }

    // Try to find a match first
    const opponent = this.findMatch(entry);
    if (opponent) {
      // Remove opponent from queue
      this.removeFromQueue(opponent);
      return opponent;
    }

    // No match found — add to queue
    const queue = this.queues.get(entry.stakeAmount) || [];
    queue.push(entry);
    this.queues.set(entry.stakeAmount, queue);
    this.playerMap.set(entry.userId, entry);

    return null;
  }

  /**
   * Remove a player from the queue.
   */
  leave(userId: string): boolean {
    const entry = this.playerMap.get(userId);
    if (!entry) return false;
    this.removeFromQueue(entry);
    return true;
  }

  /**
   * Check if a player is in queue.
   */
  isInQueue(userId: string): boolean {
    return this.playerMap.has(userId);
  }

  /**
   * Get queue size for a stake tier.
   */
  getQueueSize(stakeAmount: number): number {
    return this.queues.get(stakeAmount)?.length || 0;
  }

  /**
   * Get total players in all queues.
   */
  getTotalInQueue(): number {
    return this.playerMap.size;
  }

  /**
   * Periodic sweep: try to match all waiting players.
   * Returns array of matched pairs.
   */
  sweep(): Array<[QueueEntry, QueueEntry]> {
    const matches: Array<[QueueEntry, QueueEntry]> = [];

    for (const [stakeAmount, queue] of this.queues.entries()) {
      while (queue.length >= 2) {
        const p1 = queue[0];
        let bestIdx = -1;
        let bestDiff = Infinity;

        for (let i = 1; i < queue.length; i++) {
          const waitTime = (Date.now() - Math.min(p1.joinedAt, queue[i].joinedAt)) / 1000;
          const tolerance = Math.min(
            this.BASE_TOLERANCE + waitTime * this.TOLERANCE_PER_SEC,
            this.MAX_TOLERANCE
          );
          const ratingDiff = Math.abs(p1.rating - queue[i].rating);

          if (ratingDiff <= tolerance && ratingDiff < bestDiff) {
            bestDiff = ratingDiff;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) break; // No viable match for p1 yet

        const p2 = queue[bestIdx];
        queue.splice(bestIdx, 1);
        queue.shift(); // remove p1
        this.playerMap.delete(p1.userId);
        this.playerMap.delete(p2.userId);
        matches.push([p1, p2]);
      }
    }

    return matches;
  }

  // ─── Private ─────────────────────────────────────────

  private findMatch(entry: QueueEntry): QueueEntry | null {
    const queue = this.queues.get(entry.stakeAmount);
    if (!queue || queue.length === 0) return null;

    let bestMatch: QueueEntry | null = null;
    let bestDiff = Infinity;

    for (const candidate of queue) {
      if (candidate.userId === entry.userId) continue;

      const waitTime = (Date.now() - candidate.joinedAt) / 1000;
      const tolerance = Math.min(
        this.BASE_TOLERANCE + waitTime * this.TOLERANCE_PER_SEC,
        this.MAX_TOLERANCE
      );
      const ratingDiff = Math.abs(entry.rating - candidate.rating);

      if (ratingDiff <= tolerance && ratingDiff < bestDiff) {
        bestDiff = ratingDiff;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private removeFromQueue(entry: QueueEntry): void {
    const queue = this.queues.get(entry.stakeAmount);
    if (queue) {
      const idx = queue.findIndex((e) => e.userId === entry.userId);
      if (idx !== -1) queue.splice(idx, 1);
    }
    this.playerMap.delete(entry.userId);
  }
}

// Singleton instance
export const matchmakingQueue = new MatchmakingQueue();
