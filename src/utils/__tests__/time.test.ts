// utils/__tests__/time.test.ts

import { sleep, formatDuration, PerformanceTimer, PeriodicExecutor } from '../time';

describe('time.ts', () => {
  describe('sleep()', () => {
    it('should resolve after the specified delay', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should resolve immediately for 0ms', async () => {
      const start = Date.now();
      await sleep(0);
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  describe('formatDuration()', () => {
    it('should format milliseconds into seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(500)).toBe('0s');
      expect(formatDuration(59_999)).toBe('59s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60_000)).toBe('1m');
      expect(formatDuration(90_000)).toBe('1m 30s');
      expect(formatDuration(3_599_000)).toBe('59m 59s');
    });

    it('should format hours', () => {
      expect(formatDuration(3_600_000)).toBe('1h');
      expect(formatDuration(3_661_000)).toBe('1h 1m 1s');
    });

    it('should format days', () => {
      expect(formatDuration(86_400_000)).toBe('1d');
      expect(formatDuration(90_061_000)).toBe('1d 1h 1m 1s');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-1000)).toBe('-1s');
      expect(formatDuration(-90_000)).toBe('-1m 30s');
    });
  });

  describe('PerformanceTimer', () => {
    it('should measure elapsed time', async () => {
      const timer = new PerformanceTimer('test');
      await sleep(30);
      const { elapsedMs, elapsedFormatted, name } = timer.stop();

      expect(name).toBe('test');
      expect(elapsedMs).toBeGreaterThanOrEqual(25);
      expect(elapsedFormatted).toBe('0s');
    });

    it('should use default name if none provided', () => {
      const timer = new PerformanceTimer();
      const { name } = timer.stop();
      expect(name).toBe('Operation');
    });

    it('lap() should return elapsed without stopping', async () => {
      const timer = new PerformanceTimer('lap-test');
      await sleep(20);
      const { elapsedMs } = timer.lap();
      expect(elapsedMs).toBeGreaterThanOrEqual(15);

      await sleep(20);
      const { elapsedMs: elapsedMs2 } = timer.stop();
      expect(elapsedMs2).toBeGreaterThan(elapsedMs);
    });
  });

  describe('PeriodicExecutor', () => {
    it('should execute the task at least once', async () => {
      const task = jest.fn().mockResolvedValue(undefined);
      const executor = new PeriodicExecutor(task, 50);

      executor.start();
      await sleep(30);
      executor.stop();

      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should execute the task multiple times', async () => {
      const task = jest.fn().mockResolvedValue(undefined);
      const executor = new PeriodicExecutor(task, 30);

      executor.start();
      await sleep(120);
      executor.stop();

      expect(task.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should call onError when task throws', async () => {
      const error = new Error('task failed');
      const task = jest.fn().mockRejectedValue(error);
      const onError = jest.fn();

      const executor = new PeriodicExecutor(task, 50, onError);
      executor.start();
      await sleep(30);
      executor.stop();

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should throw if started twice', () => {
      const task = jest.fn().mockResolvedValue(undefined);
      const executor = new PeriodicExecutor(task, 1000);

      executor.start();
      expect(() => executor.start()).toThrow('PeriodicExecutor already running');
      executor.stop();
    });

    it('should stop cleanly and not execute after stop()', async () => {
      const task = jest.fn().mockResolvedValue(undefined);
      const executor = new PeriodicExecutor(task, 20);

      executor.start();
      await sleep(10);
      executor.stop();

      const callsAtStop = task.mock.calls.length;
      await sleep(60);

      expect(task.mock.calls.length).toBe(callsAtStop);
    });
  });
});