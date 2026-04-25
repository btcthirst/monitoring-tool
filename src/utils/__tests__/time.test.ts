import {
  sleep,
  unixNow,
  isoNow,
  formatDuration,
  PerformanceTimer,
  TimeTracker,
  PeriodicExecutor,
} from '../time';

describe('time utils', () => {
  describe('basic utilities', () => {
    it('should sleep for specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });

    it('should return current unix timestamp', () => {
      const now = unixNow();
      expect(now).toBeGreaterThan(1600000000);
      expect(now).toBeLessThan(2000000000);
    });

    it('should return current ISO string', () => {
      const iso = isoNow();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('formatting', () => {
    it('should format duration correctly', () => {
      expect(formatDuration(500)).toBe('0s');
      expect(formatDuration(1500)).toBe('1s');
      expect(formatDuration(61000)).toBe('1m 1s');
      expect(formatDuration(3661000)).toBe('1h 1m 1s');
      expect(formatDuration(90061000)).toBe('1d 1h 1m 1s');
      expect(formatDuration(-1500)).toBe('-1s');
    });
  });

  describe('PerformanceTimer', () => {
    it('should measure elapsed time', async () => {
      const timer = new PerformanceTimer('Test');
      await sleep(50);
      const result = timer.stop();
      expect(result.name).toBe('Test');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(45);
      expect(result.elapsedFormatted).toMatch(/\d+s/);
    });

    it('should support lap', async () => {
      const timer = new PerformanceTimer();
      await sleep(50);
      const lap1 = timer.lap();
      expect(lap1.elapsedMs).toBeGreaterThanOrEqual(45);
    });
  });

  describe('TimeTracker', () => {
    it('should track multiple operations', async () => {
      const tracker = new TimeTracker();
      await tracker.measure('op1', () => sleep(10));
      await tracker.measure('op1', () => sleep(20));
      tracker.measureSync('op2', () => {});

      const stats = tracker.getStats();
      expect(stats.has('op1')).toBe(true);
      expect(stats.get('op1')?.count).toBe(2);
      expect(stats.get('op1')?.totalMs).toBeGreaterThanOrEqual(25);
      expect(stats.get('op2')?.count).toBe(1);
    });

    it('should clear records', () => {
      const tracker = new TimeTracker();
      tracker.measureSync('op', () => {});
      tracker.clear();
      expect(tracker.getStats().size).toBe(0);
    });
  });

  describe('PeriodicExecutor', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should execute task periodically', async () => {
      const task = jest.fn().mockResolvedValue(undefined);
      const executor = new PeriodicExecutor(task, 1000);

      executor.start();
      
      // First execution is immediate (well, inside the loop)
      // We need to wait for the first iteration to complete
      await jest.advanceTimersByTimeAsync(0);
      expect(task).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000);
      expect(task).toHaveBeenCalledTimes(2);

      executor.stop();
      await jest.advanceTimersByTimeAsync(1000);
      expect(task).toHaveBeenCalledTimes(2);
    });

    it('should handle errors', async () => {
      const task = jest.fn().mockRejectedValue(new Error('Fail'));
      const onError = jest.fn();
      const executor = new PeriodicExecutor(task, 1000, onError);

      executor.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      executor.stop();
    });

    it('should prevent multiple starts', () => {
      const executor = new PeriodicExecutor(async () => {}, 1000);
      executor.start();
      expect(() => executor.start()).toThrow('PeriodicExecutor already running');
      executor.stop();
    });
  });
});
