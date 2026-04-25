import Decimal from 'decimal.js';
import {
  add,
  sub,
  mul,
  div,
  abs,
  min,
  max,
  round,
  clamp,
  compare,
  isZero,
  formatNumber,
  bigintToDecimal,
  decimalToBigint,
  percentChange,
} from '../math';

describe('math utils', () => {
  describe('basic arithmetic', () => {
    it('should add numbers', () => {
      expect(add(0.1, 0.2)).toBeCloseTo(0.3);
      expect(add('0.1', '0.2')).toBe(0.3);
      expect(add(new Decimal(0.1), 0.2)).toBe(0.3);
    });

    it('should subtract numbers', () => {
      expect(sub(0.3, 0.1)).toBeCloseTo(0.2);
      expect(sub(10n, 5n)).toBe(5);
    });

    it('should multiply numbers', () => {
      expect(mul(0.1, 0.2)).toBeCloseTo(0.02);
    });

    it('should divide numbers', () => {
      expect(div(0.3, 0.1)).toBe(3);
      expect(() => div(1, 0)).toThrow('Division by zero');
    });

    it('should calculate absolute value', () => {
      expect(abs(-5)).toBe(5);
      expect(abs(5)).toBe(5);
    });

    it('should find min/max', () => {
      expect(min(1, 2)).toBe(1);
      expect(max(1, 2)).toBe(2);
    });
  });

  describe('rounding and clamping', () => {
    it('should round to N decimal places', () => {
      expect(round(1.23456, 2)).toBe(1.23);
      expect(round(1.23456, 2, Decimal.ROUND_UP)).toBe(1.24);
    });

    it('should clamp values', () => {
      expect(clamp(5, 1, 10)).toBe(5);
      expect(clamp(0, 1, 10)).toBe(1);
      expect(clamp(11, 1, 10)).toBe(10);
    });
  });

  describe('comparison', () => {
    it('should compare with epsilon', () => {
      expect(compare(0.1 + 0.2, 0.3)).toBe(0);
      expect(compare(0.300000000001, 0.3)).toBe(0);
      expect(compare(0.4, 0.3)).toBe(1);
      expect(compare(0.2, 0.3)).toBe(-1);
    });

    it('should check for zero with epsilon', () => {
      expect(isZero(0)).toBe(true);
      expect(isZero(1e-15)).toBe(true);
      expect(isZero(0.1)).toBe(false);
    });
  });

  describe('formatting', () => {
    it('should format numbers', () => {
      expect(formatNumber(1.234567, 2)).toBe('1.23');
      expect(formatNumber(1.5, 2, false)).toBe('1.50');
      expect(formatNumber(1.5, 2, true)).toBe('1.5');
      expect(formatNumber(100, 2)).toBe('100');
    });
  });

  describe('conversions', () => {
    it('should convert bigint to Decimal', () => {
      expect(bigintToDecimal(1000000n, 6).toNumber()).toBe(1);
      expect(bigintToDecimal(1n, 9).toString()).toBe('0.000000001');
    });

    it('should convert Decimal to bigint', () => {
      expect(decimalToBigint(new Decimal('1'), 6)).toBe(1000000n);
      expect(() => decimalToBigint(new Decimal('1.234'), 2)).toThrow();
    });
  });

  describe('statistics', () => {
    it('should calculate percentage change', () => {
      expect(percentChange(100, 110)).toBe(10);
      expect(percentChange(100, 90)).toBe(-10);
      expect(percentChange(0, 100)).toBe(0);
    });
  });
});
