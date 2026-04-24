// utils/time.ts
/**
 * Утиліти для роботи з часом, таймерами та затримками
 * Включає різні формати затримок та утиліти для вимірювання продуктивності
 */

/**
 * Затримка (sleep) на певну кількість мілісекунд
 * @param ms - кількість мілісекунд для затримки
 * @returns Promise, який резолвиться після затримки
 * 
 * @example
 * await sleep(1000); // затримка на 1 секунду
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Форматування мілісекунд в читаємий рядок
   * 
   * @param ms - мілісекунди
   * @returns відформатований рядок (наприклад: "2d 3h 15m 30s")
   * 
   * @example
   * formatDuration(90061000) // "1d 1h 1m 1s"
   */
  export function formatDuration(ms: number): string {
    if (ms < 0) return `-${formatDuration(-ms)}`;
    if (ms === 0) return '0s';
    
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    
    return parts.join(' ');
  }
  
  /**
   * Парсинг рядка часу в мілісекунди
   * Підтримує формати: "1s", "500ms", "2m", "1h", "1d"
   * 
   * @param timeString - рядок часу
   * @returns кількість мілісекунд
   * @throws {Error} при невірному форматі
   * 
   * @example
   * parseTimeToMs('30s') // 30000
   * parseTimeToMs('5m') // 300000
   */
  export function parseTimeToMs(timeString: string): number {
    const match = timeString.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
    
    if (!match) {
      throw new Error(`Invalid time format: ${timeString}. Use format like "500ms", "30s", "5m", "2h", "1d"`);
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'ms': return value;
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unknown time unit: ${unit}`);
    }
  }
  
  /**
   * Вимірювач часу виконання (performance timer)
   */
  export class PerformanceTimer {
    private startTime: number;
    private name: string;
    
    constructor(name: string = 'Operation') {
      this.name = name;
      this.startTime = Date.now();
    }
    
    /**
     * Зупинка таймера та отримання результату
     */
    stop(): { name: string; elapsedMs: number; elapsedFormatted: string } {
      const elapsedMs = Date.now() - this.startTime;
      return {
        name: this.name,
        elapsedMs,
        elapsedFormatted: formatDuration(elapsedMs),
      };
    }
    
    /**
     * Логування результату (без зупинки)
     */
    lap(): { elapsedMs: number; elapsedFormatted: string } {
      const elapsedMs = Date.now() - this.startTime;
      return {
        elapsedMs,
        elapsedFormatted: formatDuration(elapsedMs),
      };
    }
    
    /**
     * Скидання таймера
     */
    reset(): void {
      this.startTime = Date.now();
    }
  }
  
  /**
   * Табулятор часу для вимірювання декількох операцій
   */
  export class TimeTracker {
    private records: Map<string, number[]> = new Map();
    
    /**
     * Вимірювання часу виконання асинхронної функції
     */
    async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - start;
        this.addRecord(label, elapsed);
      }
    }
    
    /**
     * Вимірювання часу виконання синхронної функції
     */
    measureSync<T>(label: string, fn: () => T): T {
      const start = Date.now();
      try {
        return fn();
      } finally {
        const elapsed = Date.now() - start;
        this.addRecord(label, elapsed);
      }
    }
    
    private addRecord(label: string, elapsed: number): void {
      if (!this.records.has(label)) {
        this.records.set(label, []);
      }
      this.records.get(label)!.push(elapsed);
    }
    
    /**
     * Отримання статистики для всіх вимірювань
     */
    getStats(): Map<string, { count: number; totalMs: number; avgMs: number; maxMs: number; minMs: number }> {
      const stats = new Map();
      
      for (const [label, times] of this.records) {
        const total = times.reduce((a, b) => a + b, 0);
        stats.set(label, {
          count: times.length,
          totalMs: total,
          avgMs: total / times.length,
          maxMs: Math.max(...times),
          minMs: Math.min(...times),
        });
      }
      
      return stats;
    }
    
    /**
     * Очищення всіх записів
     */
    clear(): void {
      this.records.clear();
    }
  }
  
  /**
   * Декоратор для вимірювання часу виконання методу
   */
  export function measureTime(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      const timer = new PerformanceTimer(`${propertyKey}`);
      const result = originalMethod.apply(this, args);
      
      if (result instanceof Promise) {
        return result.finally(() => {
          const { elapsedMs, elapsedFormatted } = timer.stop();
          console.log(`⏱️ ${propertyKey} took ${elapsedFormatted} (${elapsedMs}ms)`);
        });
      } else {
        const { elapsedMs, elapsedFormatted } = timer.stop();
        console.log(`⏱️ ${propertyKey} took ${elapsedFormatted} (${elapsedMs}ms)`);
        return result;
      }
    };
    
    return descriptor;
  }
  
  /**
   * Отримання поточного часу в Unix форматі (секунди)
   */
  export function unixNow(): number {
    return Math.floor(Date.now() / 1000);
  }
  
  /**
   * Отримання поточного часу в ISO форматі
   */
  export function isoNow(): string {
    return new Date().toISOString();
  }
  
  /**
   * Форматування таймстемпу в локальний час
   */
  export function formatTimestamp(timestamp: number, format: 'time' | 'date' | 'datetime' = 'datetime'): string {
    const date = new Date(timestamp);
    
    switch (format) {
      case 'time':
        return date.toLocaleTimeString();
      case 'date':
        return date.toLocaleDateString();
      case 'datetime':
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
  }
  
  /**
   * Періодичний виконавець (polling) з автоматичним управлінням
   */
  export class PeriodicExecutor {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    
    constructor(
      private task: () => Promise<void>,
      private intervalMs: number,
      private onError?: (error: Error) => void
    ) {}
    
    /**
     * Запуск періодичного виконання
     */
    start(): void {
      if (this.isRunning) {
        throw new Error('Executor is already running');
      }
      
      this.isRunning = true;
      this.executeWithCatch();
    }
    
    private async executeWithCatch(): Promise<void> {
      while (this.isRunning) {
        try {
          await this.task();
        } catch (error) {
          if (this.onError) {
            this.onError(error as Error);
          } else {
            console.error('Unhandled error in periodic executor:', error);
          }
        }
        
        if (this.isRunning) {
          await sleep(this.intervalMs);
        }
      }
    }
    
    /**
     * Зупинка періодичного виконання
     */
    stop(): void {
      this.isRunning = false;
    }
  }
  
  // Експорт публічного API
  export default {
    sleep,
    formatDuration,
    parseTimeToMs,
    PerformanceTimer,
    TimeTracker,
    measureTime,
    unixNow,
    isoNow,
    formatTimestamp,
    PeriodicExecutor,
  };