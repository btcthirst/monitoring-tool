// utils/time.ts
/**
 * Утиліти для роботи з часом, таймерами та polling.
 */

// ---------------------------------------------------------------------------
// Базові утиліти
// ---------------------------------------------------------------------------

/**
 * Асинхронна затримка.
 * @example await sleep(1000); // 1 секунда
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Поточний Unix timestamp в секундах.
 */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Поточний час в ISO форматі.
 */
export function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Форматування
// ---------------------------------------------------------------------------

/**
 * Форматування мілісекунд у читабельний рядок.
 * @example formatDuration(90061000) → '1d 1h 1m 1s'
 * @example formatDuration(1500)     → '1s'
 * @example formatDuration(500)      → '0s'
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

/**
 * Форматування таймстемпу.
 */
export function formatTimestamp(
  timestamp: number,
  format: 'time' | 'date' | 'datetime' = 'datetime',
): string {
  const date = new Date(timestamp);
  switch (format) {
    case 'time': return date.toLocaleTimeString();
    case 'date': return date.toLocaleDateString();
    case 'datetime': return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }
}

// ---------------------------------------------------------------------------
// PerformanceTimer
// ---------------------------------------------------------------------------

/**
 * Простий таймер для вимірювання тривалості операцій.
 *
 * @example
 * const timer = new PerformanceTimer('PoolDiscovery');
 * // ... операція ...
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

  reset(): void {
    // TypeScript не дозволяє перепризначити readonly — замість цього
    // створи новий PerformanceTimer якщо потрібен reset
  }
}

// ---------------------------------------------------------------------------
// TimeTracker
// ---------------------------------------------------------------------------

/**
 * Збирач статистики по кількох операціях.
 *
 * @example
 * const tracker = new TimeTracker();
 * await tracker.measure('rpcCall', () => client.getProgramAccounts(...));
 * console.log(tracker.getStats());
 */
export class TimeTracker {
  private records = new Map<string, number[]>();

  async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.record(label, Date.now() - start);
    }
  }

  measureSync<T>(label: string, fn: () => T): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      this.record(label, Date.now() - start);
    }
  }

  private record(label: string, elapsed: number): void {
    const arr = this.records.get(label) ?? [];
    arr.push(elapsed);
    this.records.set(label, arr);
  }

  getStats(): Map<string, {
    count: number;
    totalMs: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
  }> {
    const stats = new Map();
    for (const [label, times] of this.records) {
      const total = times.reduce((a, b) => a + b, 0);
      stats.set(label, {
        count: times.length,
        totalMs: total,
        avgMs: total / times.length,
        minMs: Math.min(...times),
        maxMs: Math.max(...times),
      });
    }
    return stats;
  }

  clear(): void {
    this.records.clear();
  }
}

// ---------------------------------------------------------------------------
// PeriodicExecutor
// ---------------------------------------------------------------------------

/**
 * Polling loop з автоматичним управлінням.
 *
 * Використовує while-loop замість setInterval — гарантує що наступна
 * ітерація починається тільки після завершення попередньої.
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