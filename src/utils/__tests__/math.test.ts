// utils/__tests__/math.test.ts

import { add, sub, mul, div, abs, min, max, formatNumber } from '../math';

describe('math.ts', () => {
  describe('add()', () => {
    it('should add two numbers', () => {
      expect(add(1, 2)).toBe(3);
    });

    it('should handle floating point precisely', () => {
      // Native JS: 0.1 + 0.2 = 0.30000000000000004
      expect(add(0.1, 0.2)).toBeCloseTo(0.3, 15);
    });

    it('should accept bigint inputs', () => {
      expect(add(1000000n, 500000n)).toBe(1500000);
    });

    it('should accept string inputs', () => {
      expect(add('1.5', '2.5')).toBe(4);
    });
  });

  describe('sub()', () => {
    it('should subtract two numbers', () => {
      expect(sub(5, 3)).toBe(2);
      expect(sub(1, 1)).toBe(0);
    });

    it('should handle negative result', () => {
      expect(sub(3, 5)).toBe(-2);
    });

    it('should handle floating point precisely', () => {
      // Native JS: 0.3 - 0.1 = 0.19999999999999998
      expect(sub(0.3, 0.1)).toBeCloseTo(0.2, 15);
    });

    it('should accept bigint inputs', () => {
      expect(sub(1_500_000n, 500_000n)).toBe(1_000_000);
    });
  });

  describe('mul()', () => {
    it('should multiply two numbers', () => {
      expect(mul(3, 4)).toBe(12);
    });

    it('should handle decimal multiplication precisely', () => {
      expect(mul(0.1, 3)).toBeCloseTo(0.3, 15);
    });

    it('should handle large integers via bigint', () => {
      expect(mul(1_000_000n, 1_000_000n)).toBe(1_000_000_000_000);
    });
  });

  describe('div()', () => {
    it('should divide two numbers', () => {
      expect(div(10, 4)).toBe(2.5);
    });

    it('should throw on division by zero', () => {
      expect(() => div(10, 0)).toThrow('Division by zero');
    });

    it('should handle bigint inputs', () => {
      expect(div(1_000_000n, 2n)).toBe(500000);
    });
  });

  describe('abs()', () => {
    it('should return absolute value of a negative number', () => {
      expect(abs(-5.5)).toBe(5.5);
    });

    it('should return the same value for a positive number', () => {
      expect(abs(3.14)).toBe(3.14);
    });

    it('should return 0 for zero', () => {
      expect(abs(0)).toBe(0);
    });
  });

  describe('min()', () => {
    it('should return the smaller value', () => {
      expect(min(3, 7)).toBe(3);
      expect(min(7, 3)).toBe(3);
    });

    it('should handle equal values', () => {
      expect(min(5, 5)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(min(-1, -5)).toBe(-5);
    });
  });

  describe('max()', () => {
    it('should return the larger value', () => {
      expect(max(3, 7)).toBe(7);
      expect(max(7, 3)).toBe(7);
    });

    it('should handle equal values', () => {
      expect(max(5, 5)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(max(-1, -5)).toBe(-1);
    });
  });

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