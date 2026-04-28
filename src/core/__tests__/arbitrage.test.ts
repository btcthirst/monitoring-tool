import { findArbitrageOpportunities, isSamePair, getOpportunityStats } from '../arbitrage';
import { NormalizedPool, RawPool, ArbitrageConfig } from '../types';

describe('arbitrage logic', () => {
  const tokenA = 'A'.repeat(44);
  const tokenB = 'B'.repeat(44);
  const tokenC = 'C'.repeat(44);

  const mockConfig: ArbitrageConfig = {
    tradeSize: 1000,
    minProfit: 10,
    maxSlippage: 0.01,
    txCostInQuote: 1,
    quoteMint: tokenB,
  };

  const pool1: RawPool = {
    address: 'P1',
    tokenA,
    tokenB,
    reserveA: 1000000000000n, // 1M with 6 decimals
    reserveB: 2000000000000n, // 2M with 6 decimals
    decimalsA: 6,
    decimalsB: 6,
    feeBps: 25,
  };

  const pool2: RawPool = {
    address: 'P2',
    tokenA,
    tokenB,
    reserveA: 1000000000000n,
    reserveB: 2100000000000n, // 2.1M with 6 decimals
    decimalsA: 6,
    decimalsB: 6,
    feeBps: 25,
  };

  describe('isSamePair', () => {
    it('should identify same pairs regardless of order', () => {
      const p1 = { tokenA: 'X', tokenB: 'Y', tvl: 0 } as NormalizedPool;
      const p2 = { tokenA: 'Y', tokenB: 'X', tvl: 0 } as NormalizedPool;
      const p3 = { tokenA: 'X', tokenB: 'Z', tvl: 0 } as NormalizedPool;

      expect(isSamePair(p1, p2)).toBe(true);
      expect(isSamePair(p1, p3)).toBe(false);
    });
  });

  describe('findArbitrageOpportunities', () => {
    it('should return empty array if less than 2 pools', () => {
      expect(findArbitrageOpportunities([pool1], mockConfig)).toEqual([]);
    });

    it('should find opportunities between pools of same pair', () => {
      const opps = findArbitrageOpportunities([pool1, pool2], mockConfig);

      expect(opps.length).toBeGreaterThan(0);
      const best = opps[0]!;

      expect(best.netProfit).toBeGreaterThan(0);
    });

    it('should ignore pools with different pairs', () => {
      const pool3: RawPool = {
        ...pool1,
        address: 'P3',
        tokenB: tokenC,
      };
      const opps = findArbitrageOpportunities([pool1, pool3], mockConfig);
      expect(opps.length).toBe(0);
    });
  });

  describe('getOpportunityStats', () => {
    it('should calculate stats for opportunities', () => {
      const opps = [
        { netProfit: 10, amountIn: 100 },
        { netProfit: 20, amountIn: 200 },
      ] as any;
      const stats = getOpportunityStats(opps);
      expect(stats.count).toBe(2);
      expect(stats.maxProfit).toBe(20);
      expect(stats.avgProfit).toBe(15);
      expect(stats.totalVolume).toBe(300);
    });

    it('should return zeros for empty array', () => {
      const stats = getOpportunityStats([]);
      expect(stats.count).toBe(0);
      expect(stats.maxProfit).toBe(0);
    });
  });
});
