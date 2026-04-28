// core/types.ts
/**
 * Pure domain types for the arbitrage module.
 * Does not contain dependencies on Solana/RPC.
 */

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

/**
 * Raw pool from the blockchain.
 * Reserves are stored as bigint (lamports / raw units).
 */
export type RawPool = {
  address: string;
  tokenA: string;
  tokenB: string;
  reserveA: bigint;
  reserveB: bigint;
  decimalsA: number;
  decimalsB: number;
  /** Fee in basis points (25 = 0.25%) */
  feeBps: number;
};

/**
 * Normalized pool.
 * Reserves are converted to number considering decimals — ready for math.
 */
export type NormalizedPool = {
  address: string;
  tokenA: string;
  tokenB: string;
  /** Reserve of token A in normalized units */
  reserveA: number;
  /** Reserve of token B in normalized units */
  reserveB: number;
  /** Estimated TVL in quote units */
  tvl: number;
  /** Fee as decimal (0.0025 = 0.25%) */
  fee: number;
  decimalsA: number;
  decimalsB: number;
};

// ---------------------------------------------------------------------------
// Arbitrage Configuration
// ---------------------------------------------------------------------------

/**
 * Parameters for finding and evaluating arbitrage opportunities.
 * All amounts are in normalized quote token units.
 */
export type ArbitrageConfig = {
  /** Simulated trade size (e.g. 100 USDC) */
  tradeSize: number;
  /** Minimum net profit for signal */
  minProfit: number;
  /**
   * Max allowed slippage as decimal.
   * 0.05 = 5%. Checked separately for buy and sell swap.
   */
  maxSlippage: number;
  /** Transaction cost in quote token (accounted for in net profit) */
  txCostInQuote: number;
  /** Mint address of quote token (for logging and UI context) */
  quoteMint: string;
};

// ---------------------------------------------------------------------------
// Arbitrage Result
// ---------------------------------------------------------------------------

/**
 * Arbitrage opportunity — result of simulating two swaps.
 */
export type Opportunity = {
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  /** Input amount in quote token */
  amountIn: number;
  /** Output amount in quote token after both swaps */
  amountOut: number;
  /** Gross profit = amountOut - amountIn (before tx cost) */
  grossProfit: number;
  /** Transaction cost (from config) */
  txCost: number;
  /** Net profit = grossProfit - txCost */
  netProfit: number;
  /** Net profit relative to amountIn, as a percentage */
  profitPercent: number;
  /**
   * Relative slippage on buy swap.
   * Negative value = received less than spot price.
   * Example: -0.003 = -0.3%
   */
  slippageBuy: number;
  /** Relative slippage on sell swap (similar to slippageBuy) */
  slippageSell: number;
  /** Spot price of base token in buy pool (quote per base, e.g. USDC per SOL) */
  spotPriceBuy: number;
  /** Spot price of base token in sell pool (quote per base, e.g. USDC per SOL) */
  spotPriceSell: number;
  /** Relative price spread between pools: (sellPrice - buyPrice) / buyPrice * 100 */
  priceSpreadPercent: number;
  /** Unix timestamp (ms) of the calculation moment */
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

/**
 * Validation result.
 * Used where error is not an exception (soft check).
 */
export type ValidationResult =
  | { isValid: true; maxAmount?: number }
  | { isValid: false; error: string; maxAmount?: number };

/**
 * Statistics for a set of opportunities.
 */
export type OpportunityStats = {
  count: number;
  maxProfit: number;
  avgProfit: number;
  totalVolume: number;
};