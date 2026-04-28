// utils/__tests__/math.test.ts

import { formatNumber } from '../math';

describe('math.ts', () => {
  describe('formatNumber()', () => {
    it('should format with default 6 decimal places', () => {
      expect(formatNumber(1.5)).toBe('1.5');
    });

    it('should strip trailing zeros by default', () => {
      expect(formatNumber(1.500000, 6, true)).toBe('1.5');
      expect(formatNumber(1.0, 6, true)).toBe('1');
    });

    it('should keep trailing zeros when stripTrailingZeros is false', () => {
      expect(formatNumber(1.5, 6, false)).toBe('1.500000');
    });

    it('should round down (conservative)', () => {
      // ROUND_DOWN: 1.9999999 with 6 decimals -> 1.999999, not 2.000000
      expect(formatNumber(1.9999999, 6, false)).toBe('1.999999');
    });

    it('should handle zero', () => {
      expect(formatNumber(0, 6, false)).toBe('0.000000');
      expect(formatNumber(0, 6, true)).toBe('0');
    });

    it('should handle bigint input', () => {
      expect(formatNumber(1000000n, 0)).toBe('1000000');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1.5, 2, false)).toBe('-1.50');
    });

    it('should respect custom decimal places', () => {
      expect(formatNumber(3.14159, 2, false)).toBe('3.14');
      expect(formatNumber(3.14159, 4, false)).toBe('3.1415');
    });

    it('should return "NaN" for NaN input without throwing', () => {
      expect(formatNumber(NaN)).toBe('NaN');
    });

    it('should return "Infinity" for Infinity input without throwing', () => {
      expect(formatNumber(Infinity)).toBe('Infinity');
    });

    it('should return "-Infinity" for -Infinity input without throwing', () => {
      expect(formatNumber(-Infinity)).toBe('-Infinity');
    });
  });
});