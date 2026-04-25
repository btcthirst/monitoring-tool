// core/arbitrage.ts
/**
 * Search for arbitrage opportunities between pools.
 *
 * Module rules:
 * - No dependencies on Solana/RPC/logger/UI
 * - Only pure business logic
 * - Errors bubble up or return null — not logged here
 */

import {
  RawPool,
  NormalizedPool,
  ArbitrageConfig,
  Opportunity,
  OpportunityStats,
} from './types';

import {
  normalizePool,
  simulateTwoHopArbitrage,
  calculateGrossProfit,
  calculateNetProfit,
  calculateProfitPercent,
  isProfitable,
  validateTradeSize,
} from './pricing';

// ---------------------------------------------------------------------------
// Helpers for pool pairs
// ---------------------------------------------------------------------------

/**
 * Check if two pools trade the same token pair
 * (regardless of tokenA/tokenB order).
 */
export function isSamePair(a: NormalizedPool, b: NormalizedPool): boolean {
  return (
    (a.tokenA === b.tokenA && a.tokenB === b.tokenB) ||
    (a.tokenA === b.tokenB && a.tokenB === b.tokenA)
  );
}

/**
 * Canonical token pair key (sorted addresses joined by ':').
 * Used to group pools.
 */
function pairKey(tokenA: string, tokenB: string): string {
  return [tokenA, tokenB].sort().join(':');
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Find all arbitrage opportunities among an array of pools.
 *
 * Algorithm:
 * 1. Normalize all pools (bigint -> number)
 * 2. Group by canonical token pair key
 * 3. For each group, iterate over all unique pool pairs (i, j)
 * 4. Check both arbitrage directions
 * 5. Return filtered and sorted opportunities
 *
 * @param rawPools — raw pools from the blockchain
 * @param config   — arbitrage parameters
 * @returns array of opportunities, sorted by netProfit (best on top)
 */
export function findArbitrageOpportunities(
  rawPools: RawPool[],
  config: ArbitrageConfig,
): Opportunity[] {
  if (rawPools.length < 2) return [];

  // Step 1: normalization
  const pools: NormalizedPool[] = rawPools.map((p) => normalizePool(p, config.quoteMint));

  // Step 2: grouping by pair
  const byPair = new Map<string, NormalizedPool[]>();
  for (const pool of pools) {
    const key = pairKey(pool.tokenA, pool.tokenB);
    const group = byPair.get(key) ?? [];
    group.push(pool);
    byPair.set(key, group);
  }

  // Step 3-4: search for opportunities
  const opportunities: Opportunity[] = [];

  for (const group of byPair.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;

        const opp1 = evaluateDirection(a, b, config);
        if (opp1) opportunities.push(opp1);

        const opp2 = evaluateDirection(b, a, config);
        if (opp2) opportunities.push(opp2);
      }
    }
  }

  // Step 5: sorting
  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

// ---------------------------------------------------------------------------
// Single direction evaluation
// ---------------------------------------------------------------------------

/**
 * Arbitrage simulation: buy in buyPool, sell in sellPool.
 * Returns Opportunity if trade is profitable, otherwise null.
 */
function evaluateDirection(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  config: ArbitrageConfig,
): Opportunity | null {
  if (!isSamePair(buyPool, sellPool)) return null;

  // Trade size validation for both pools
  const buyCheck = validateTradeSize(buyPool, config.tradeSize);
  const sellCheck = validateTradeSize(sellPool, config.tradeSize);

  if (!buyCheck.isValid || !sellCheck.isValid) return null;

  // Simulation
  let result: ReturnType<typeof simulateTwoHopArbitrage>;
  try {
    result = simulateTwoHopArbitrage(buyPool, sellPool, config.tradeSize);
  } catch {
    // Math error (e.g. overflow) — skip pair
    return null;
  }

  const { amountOut, slippageBuy, slippageSell } = result;

  // Profit calculation
  const grossProfit = calculateGrossProfit(config.tradeSize, amountOut);
  const netProfit = calculateNetProfit(grossProfit, config.txCostInQuote);
  const profitPercent = calculateProfitPercent(netProfit, config.tradeSize);

  // Profitability filter
  const { profitable } = isProfitable(
    grossProfit,
    config.txCostInQuote,
    config.minProfit,
    config.maxSlippage,
    slippageBuy,
    slippageSell,
  );

  if (!profitable) return null;

  return {
    buyPool,
    sellPool,
    amountIn: config.tradeSize,
    amountOut,
    grossProfit,
    txCost: config.txCostInQuote,
    netProfit,
    profitPercent,
    slippageBuy,
    slippageSell,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Utilities for working with results
// ---------------------------------------------------------------------------

/**
 * Returns top N opportunities (array is already sorted).
 */
export function getTopOpportunities(opportunities: Opportunity[], limit: number): Opportunity[] {
  return opportunities.slice(0, limit);
}



/**
 * Aggregated statistics for a set of opportunities.
 */
export function getOpportunityStats(opportunities: Opportunity[]): OpportunityStats {
  if (opportunities.length === 0) {
    return { count: 0, maxProfit: 0, avgProfit: 0, totalVolume: 0 };
  }

  const profits = opportunities.map((o) => o.netProfit);
  const totalVolume = opportunities.reduce((sum, o) => sum + o.amountIn, 0);

  return {
    count: opportunities.length,
    maxProfit: Math.max(...profits),
    avgProfit: profits.reduce((a, b) => a + b, 0) / profits.length,
    totalVolume,
  };
}