// utils/time.ts
/**
 * Utilities for working with time, timers, and polling.
 */

// ---------------------------------------------------------------------------
// Basic utilities
// ---------------------------------------------------------------------------

/**
 * Asynchronous delay.
 * @example await sleep(1000); // 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format milliseconds into a readable string.
 * @example formatDuration(90061000) -> '1d 1h 1m 1s'
 * @example formatDuration(1500)     -> '1s'
 * @example formatDuration(500)      -> '0s'
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return `-${formatDuration(-ms)}`;

  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000) % 24;
  const d = Math.floor(ms / 86_400_000);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// PerformanceTimer
// ---------------------------------------------------------------------------

/**
 * Simple timer for measuring operation duration.
 *
 * @example
 * const timer = new PerformanceTimer('PoolDiscovery');
 * // ... operation ...
 * const { elapsedMs, elapsedFormatted } = timer.stop();
 */
export class PerformanceTimer {
  private readonly startTime: number;
  private readonly name: string;

  constructor(name = 'Operation') {
    this.name = name;
    this.startTime = Date.now();
  }

  stop(): { name: string; elapsedMs: number; elapsedFormatted: string } {
    const elapsedMs = Date.now() - this.startTime;
    return { name: this.name, elapsedMs, elapsedFormatted: formatDuration(elapsedMs) };
  }

  lap(): { elapsedMs: number; elapsedFormatted: string } {
    const elapsedMs = Date.now() - this.startTime;
    return { elapsedMs, elapsedFormatted: formatDuration(elapsedMs) };
  }
}

// ---------------------------------------------------------------------------
// PeriodicExecutor
// ---------------------------------------------------------------------------

/**
 * Polling loop with automatic management.
 *
 * Uses while-loop instead of setInterval — guarantees that the next
 * iteration begins only after the previous one completes.
 *
 * @example
 * const executor = new PeriodicExecutor(
 *   () => updateCycle(),
 *   2000,
 *   (err) => logger.error('Cycle failed', { error: err.message }),
 * );
 * executor.start();
 * // ...
 * executor.stop();
 */
export class PeriodicExecutor {
  private running = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly onError?: (error: Error) => void,
  ) { }

  start(): void {
    if (this.running) throw new Error('PeriodicExecutor already running');
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.task();
      } catch (error) {
        if (this.onError) {
          this.onError(error as Error);
        }
      }

      if (this.running) {
        await sleep(this.intervalMs);
      }
    }
  }
}