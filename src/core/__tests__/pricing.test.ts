// core/__tests__/pricing.test.ts

import {
  normalizeAmount,
  getAmountOut,
  simulateSwapAtoB,
  simulateSwapBtoA,
  simulateTwoHopArbitrage,
  validateTradeSize,
  normalizePool,
  calculateGrossProfit,
  calculateNetProfit,
  calculateProfitPercent,
  isProfitable,
} from '../pricing';
import { NormalizedPool, RawPool } from '../types';

const QUOTE = 'QUOTE_MINT_ADDRESS_000000000000000000000000';
const BASE = 'BASE__MINT_ADDRESS_000000000000000000000000';

const makePool = (overrides: Partial<NormalizedPool> = {}): NormalizedPool => ({
  address: 'pool1',
  tokenA: BASE,
  tokenB: QUOTE,
  reserveA: 1000,
  reserveB: 10000,
  tvl: 20000,
  fee: 0.0025,
  decimalsA: 9,
  decimalsB: 6,
  ...overrides,
});

describe('pricing.ts', () => {
  describe('normalizeAmount()', () => {
    it('should convert raw bigint to number using decimals', () => {
      expect(normalizeAmount(1_000_000n, 6)).toBe(1);
      expect(normalizeAmount(1_500_000n, 6)).toBe(1.5);
      expect(normalizeAmount(1_000_000_000n, 9)).toBe(1);
      expect(normalizeAmount(0n, 6)).toBe(0);
    });

    it('should correctly handle 9-decimal tokens (SOL)', () => {
      expect(normalizeAmount(10_000_000_000n, 9)).toBe(10);
    });

    it('should throw when integer part exceeds MAX_SAFE_INTEGER', () => {
      const huge = BigInt(Number.MAX_SAFE_INTEGER) * 10n + 1n;
      expect(() => normalizeAmount(huge, 0)).toThrow();
    });

    it('should NOT throw when integer part equals MAX_SAFE_INTEGER exactly', () => {
      const exact = BigInt(Number.MAX_SAFE_INTEGER);
      expect(() => normalizeAmount(exact, 0)).not.toThrow();
      expect(normalizeAmount(exact, 0)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should correctly handle large SOL pool reserve (1M SOL in lamports)', () => {
      // 1_000_000 SOL = 1_000_000 * 10^9 lamports = 10^15
      const oneMillion = 1_000_000n * 1_000_000_000n; // 10^15
      const result = normalizeAmount(oneMillion, 9);
      expect(result).toBe(1_000_000);
    });

    it('should preserve fractional precision for large values', () => {
      // 1_000_000.5 SOL = 1_000_000_500_000_000 lamports
      const raw = 1_000_000_500_000_000n;
      const result = normalizeAmount(raw, 9);
      expect(result).toBeCloseTo(1_000_000.5, 3);
    });
  });

  describe('getAmountOut()', () => {
    it('should calculate correct output using CPMM formula', () => {
      // amountIn=100, fee=0.01, reserveIn=1000, reserveOut=2000
      // amountInWithFee = 99
      // numerator = 99 * 2000 = 198000
      // denominator = 1000 + 99 = 1099
      // result = 198000 / 1099 ≈ 180.1638
      expect(getAmountOut(100, 1000, 2000, 0.01)).toBeCloseTo(180.1638, 3);
    });

    it('should return 0 for zero amountIn', () => {
      expect(getAmountOut(0, 1000, 2000, 0.01)).toBe(0);
    });

    it('should return 0 for zero reserveIn', () => {
      expect(getAmountOut(100, 0, 2000, 0.01)).toBe(0);
    });

    it('should return 0 for zero reserveOut', () => {
      expect(getAmountOut(100, 1000, 0, 0.01)).toBe(0);
    });

    it('should return 0 for negative amountIn', () => {
      expect(getAmountOut(-1, 1000, 2000, 0.01)).toBe(0);
    });

    it('should throw for fee >= 1', () => {
      expect(() => getAmountOut(100, 1000, 2000, 1)).toThrow('Invalid fee');
    });

    it('should throw for negative fee', () => {
      expect(() => getAmountOut(100, 1000, 2000, -0.1)).toThrow('Invalid fee');
    });

    it('should work correctly with zero fee', () => {
      // amountOut = (100 * 2000) / (1000 + 100) = 200000 / 1100 ≈ 181.818
      expect(getAmountOut(100, 1000, 2000, 0)).toBeCloseTo(181.818, 2);
    });
  });

  describe('simulateSwapAtoB() / simulateSwapBtoA()', () => {
    it('simulateSwapAtoB should use reserveA as input', () => {
      const pool = makePool();
      const out = simulateSwapAtoB(pool, 100);
      expect(out).toBeCloseTo(getAmountOut(100, pool.reserveA, pool.reserveB, pool.fee), 8);
    });

    it('simulateSwapBtoA should use reserveB as input', () => {
      const pool = makePool();
      const out = simulateSwapBtoA(pool, 1000);
      expect(out).toBeCloseTo(getAmountOut(1000, pool.reserveB, pool.reserveA, pool.fee), 8);
    });
  });

  describe('normalizePool()', () => {
    it('should convert bigint reserves to number', () => {
      const raw: RawPool = {
        address: 'addr',
        tokenA: BASE,
        tokenB: QUOTE,
        reserveA: 1_000_000_000n,
        reserveB: 100_000_000n,
        decimalsA: 9,
        decimalsB: 6,
        feeBps: 25,
      };

      const pool = normalizePool(raw);
      expect(pool.reserveA).toBeCloseTo(1, 6);
      expect(pool.reserveB).toBeCloseTo(100, 6);
      expect(pool.fee).toBeCloseTo(0.0025, 6);
    });

    it('should calculate TVL when quoteMint matches tokenB', () => {
      const raw: RawPool = {
        address: 'addr',
        tokenA: BASE,
        tokenB: QUOTE,
        reserveA: 1_000_000_000n,
        reserveB: 100_000_000n,
        decimalsA: 9,
        decimalsB: 6,
        feeBps: 25,
      };

      const pool = normalizePool(raw, QUOTE);
      expect(pool.tvl).toBeCloseTo(200, 4); // 2 * reserveB
    });

    it('should return tvl=0 when quoteMint is not provided', () => {
      const raw: RawPool = {
        address: 'addr',
        tokenA: BASE,
        tokenB: QUOTE,
        reserveA: 1_000_000_000n,
        reserveB: 100_000_000n,
        decimalsA: 9,
        decimalsB: 6,
        feeBps: 25,
      };

      const pool = normalizePool(raw);
      expect(pool.tvl).toBe(0);
    });
  });

  describe('validateTradeSize()', () => {
    it('should pass when trade size is within 10% of pool liquidity', () => {
      const pool = makePool({ reserveB: 10000 });
      const result = validateTradeSize(pool, 500, 0.1, QUOTE);
      expect(result.isValid).toBe(true);
    });

    it('should fail when trade size exceeds 10% of pool liquidity', () => {
      const pool = makePool({ reserveB: 1000 });
      const result = validateTradeSize(pool, 200, 0.1, QUOTE);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toContain('exceeds');
      }
    });

    it('should use tokenA reserve when quoteMint matches tokenA', () => {
      const pool = makePool({ tokenA: QUOTE, tokenB: BASE, reserveA: 5000 });
      const result = validateTradeSize(pool, 400, 0.1, QUOTE);
      expect(result.isValid).toBe(true);
    });
  });

  describe('simulateTwoHopArbitrage()', () => {
    const buyPool = makePool({
      address: 'buy',
      reserveA: 1000,
      reserveB: 10000,
    });

    const sellPool = makePool({
      address: 'sell',
      reserveA: 1000,
      reserveB: 11000, // higher price
    });

    it('should return positive amountOut when sell pool has more reserves', () => {
      const result = simulateTwoHopArbitrage(buyPool, sellPool, 1000, QUOTE);
      expect(result.amountOut).toBeGreaterThan(0);
    });

    it('should return amountOut < amountIn when pools have same price', () => {
      // Same pool on both sides — only fees apply, no price difference
      const result = simulateTwoHopArbitrage(buyPool, buyPool, 1000, QUOTE);
      expect(result.amountOut).toBeLessThan(1000);
    });

    it('should calculate positive gross profit with favorable price difference', () => {
      // Use small amountIn (0.1% of pool) so slippage doesn't swamp the price difference
      const result = simulateTwoHopArbitrage(buyPool, sellPool, 10, QUOTE);
      const gross = calculateGrossProfit(10, result.amountOut);
      expect(gross).toBeGreaterThan(0);
    });

    it('should return slippage values', () => {
      const result = simulateTwoHopArbitrage(buyPool, sellPool, 1000, QUOTE);
      expect(typeof result.slippageBuy).toBe('number');
      expect(typeof result.slippageSell).toBe('number');
    });
  });

  describe('calculateGrossProfit()', () => {
    it('should return amountOut - amountIn', () => {
      expect(calculateGrossProfit(100, 110)).toBe(10);
      expect(calculateGrossProfit(100, 90)).toBe(-10);
      expect(calculateGrossProfit(100, 100)).toBe(0);
    });
  });

  describe('calculateNetProfit()', () => {
    it('should subtract tx cost from gross profit', () => {
      expect(calculateNetProfit(10, 0.5)).toBeCloseTo(9.5);
      expect(calculateNetProfit(0.1, 0.5)).toBeCloseTo(-0.4);
    });
  });

  describe('calculateProfitPercent()', () => {
    it('should return profit as percentage of amountIn', () => {
      expect(calculateProfitPercent(10, 100)).toBe(10);
      expect(calculateProfitPercent(-5, 100)).toBe(-5);
    });

    it('should return 0 when amountIn is 0', () => {
      expect(calculateProfitPercent(10, 0)).toBe(0);
    });
  });

  describe('isProfitable()', () => {
    it('should return profitable=true when all conditions are met', () => {
      const result = isProfitable(10, 0.5, 1, 0.05, -0.001, -0.001);
      expect(result.profitable).toBe(true);
    });

    it('should return profitable=false when net profit <= minProfit', () => {
      const result = isProfitable(1, 0.5, 5, 0.05, 0, 0);
      expect(result.profitable).toBe(false);
      expect(result.reason).toContain('Net profit');
    });

    it('should return profitable=false when buy slippage exceeds max', () => {
      const result = isProfitable(10, 0.5, 1, 0.05, -0.1, 0);
      expect(result.profitable).toBe(false);
      expect(result.reason).toContain('Buy slippage');
    });

    it('should return profitable=false when sell slippage exceeds max', () => {
      const result = isProfitable(10, 0.5, 1, 0.05, 0, -0.1);
      expect(result.profitable).toBe(false);
      expect(result.reason).toContain('Sell slippage');
    });

    it('should check absolute value of slippage', () => {
      // positive slippage (better than expected) should not trigger the guard
      const result = isProfitable(10, 0.5, 1, 0.05, 0.1, 0);
      // abs(0.1) > 0.05 → should fail
      expect(result.profitable).toBe(false);
    });
  });
});