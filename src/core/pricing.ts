// core/pricing.ts
/**
 * Pure math for CPMM (Constant Product Market Maker).
 *
 * Module rules:
 * - No side effects, no dependencies on Solana/RPC/logger
 * - All functions are pure
 * - bigint for raw blockchain data, number for calculations
 */

import { RawPool, NormalizedPool, ValidationResult } from './types';

// ---------------------------------------------------------------------------
// Conversion between bigint and number
// ---------------------------------------------------------------------------

/**
 * Normalize amount from bigint to number considering decimals.
 *
 * @throws {Error} if the integer part exceeds MAX_SAFE_INTEGER
 */
export function normalizeAmount(amount: bigint, decimals: number): number {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (integerPart > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Amount ${amount} exceeds MAX_SAFE_INTEGER after normalization (decimals: ${decimals})`,
    );
  }

  return Number(integerPart) + Number(fractionalPart) / Number(divisor);
}

/**
 * Convert number back to bigint considering decimals.
 *
 * @throws {Error} if conversion loses precision
 */
export function denormalizeAmount(amount: number, decimals: number): bigint {
  const amountStr = amount.toFixed(decimals);
  const [integer, fraction = ''] = amountStr.split('.');
  const fullStr = integer + fraction.padEnd(decimals, '0');

  try {
    return BigInt(fullStr);
  } catch {
    throw new Error(`Failed to denormalize ${amount} with decimals ${decimals}`);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check pool reserves before calculations.
 */
export function validateReserves(reserveA: bigint, reserveB: bigint): ValidationResult {
  if (reserveA === 0n) {
    return { isValid: false, error: 'Reserve A is zero' };
  }
  if (reserveB === 0n) {
    return { isValid: false, error: 'Reserve B is zero' };
  }
  return { isValid: true };
}

/**
 * Check trade size relative to pool liquidity.
 * By default, trade should not exceed 10% of the reserve.
 */
export function validateTradeSize(
  pool: NormalizedPool,
  amountIn: number,
  maxPercentOfPool = 0.1,
): ValidationResult {
  const maxAmount = pool.reserveA * maxPercentOfPool;

  if (amountIn > maxAmount) {
    return {
      isValid: false,
      error: `Trade size ${amountIn} exceeds ${maxPercentOfPool * 100}% of pool liquidity (max: ${maxAmount.toFixed(6)})`,
      maxAmount,
    };
  }

  return { isValid: true, maxAmount };
}

// ---------------------------------------------------------------------------
// Pool Normalization
// ---------------------------------------------------------------------------

/**
 * Convert RawPool to NormalizedPool.
 * Converts bigint reserves to number and fee from bps to decimal.
 */
export function normalizePool(raw: RawPool): NormalizedPool {
  return {
    address: raw.address,
    tokenA: raw.tokenA,
    tokenB: raw.tokenB,
    reserveA: normalizeAmount(raw.reserveA, raw.decimalsA),
    reserveB: normalizeAmount(raw.reserveB, raw.decimalsB),
    fee: raw.feeBps / 10_000,
    decimalsA: raw.decimalsA,
    decimalsB: raw.decimalsB,
  };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Spot price: how much tokenB one tokenA gives (without price impact).
 * Returns 0 if reserve A is zero.
 */
export function getSpotPrice(pool: NormalizedPool): number {
  if (pool.reserveA === 0) return 0;
  return pool.reserveB / pool.reserveA;
}

// ---------------------------------------------------------------------------
// CPMM Swap Formula
// ---------------------------------------------------------------------------

/**
 * Calculate output amount using CPMM formula:
 *
 *   amountOut = (amountIn * (1 - fee) * reserveOut)
 *             / (reserveIn + amountIn * (1 - fee))
 *
 * Returns 0 on invalid input instead of throwing —
 * caller (arbitrage.ts) decides what to do with zero result.
 *
 * @throws {Error} only on invalid fee (programming error)
 */
export function getAmountOut(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  fee: number,
): number {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;

  if (fee < 0 || fee >= 1) {
    throw new Error(`Invalid fee value: ${fee}. Must be in [0, 1).`);
  }

  const amountInWithFee = amountIn * (1 - fee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;

  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * Simulate swap A -> B within one pool.
 */
export function simulateSwapAtoB(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveA, pool.reserveB, pool.fee);
}

/**
 * Simulate swap B -> A within one pool.
 */
export function simulateSwapBtoA(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveB, pool.reserveA, pool.fee);
}

// ---------------------------------------------------------------------------
// Two-hop Arbitrage
// ---------------------------------------------------------------------------

/**
 * Simulate arbitrage across two pools: A -> B (buyPool) -> A (sellPool).
 *
 * Slippage is calculated as relative deviation from spot price:
 *   slippage = (actualOut - expectedOut) / expectedOut
 * Negative value means received less than spot (normal situation).
 *
 * @returns amountOut — amount of A after both swaps
 * @returns slippageBuy — relative deviation on the first swap
 * @returns slippageSell — relative deviation on the second swap
 */
export function simulateTwoHopArbitrage(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  amountIn: number,
): { amountOut: number; slippageBuy: number; slippageSell: number } {
  const spotBuy = getSpotPrice(buyPool);   // B per A
  const spotSell = getSpotPrice(sellPool); // B per A

  // Hop 1: A -> B through buyPool
  const amountIntermediate = simulateSwapAtoB(buyPool, amountIn);

  // Slippage on buy
  const expectedIntermediate = spotBuy === 0 ? 0 : amountIn * spotBuy;
  const slippageBuy =
    expectedIntermediate === 0
      ? 0
      : (amountIntermediate - expectedIntermediate) / expectedIntermediate;

  // Hop 2: B -> A through sellPool
  const amountOut = simulateSwapBtoA(sellPool, amountIntermediate);

  // Slippage on sell
  const expectedOut = spotSell === 0 ? 0 : amountIntermediate / spotSell;
  const slippageSell =
    expectedOut === 0
      ? 0
      : (amountOut - expectedOut) / expectedOut;

  return { amountOut, slippageBuy, slippageSell };
}

// ---------------------------------------------------------------------------
// Profit Calculation
// ---------------------------------------------------------------------------

/** Gross profit = amountOut - amountIn */
export function calculateGrossProfit(amountIn: number, amountOut: number): number {
  return amountOut - amountIn;
}

/** Net profit = grossProfit - txCost */
export function calculateNetProfit(grossProfit: number, txCost: number): number {
  return grossProfit - txCost;
}

/** Profit percentage relative to input amount */
export function calculateProfitPercent(profit: number, amountIn: number): number {
  if (amountIn === 0) return 0;
  return (profit / amountIn) * 100;
}

/**
 * Check profitability of the trade considering slippage.
 * Uses maxSlippage as decimal (0.05 = 5%).
 */
export function isProfitable(
  grossProfit: number,
  txCost: number,
  minProfit: number,
  maxSlippage: number,
  slippageBuy: number,
  slippageSell: number,
): { profitable: boolean; reason?: string } {
  const netProfit = grossProfit - txCost;

  if (netProfit <= minProfit) {
    return {
      profitable: false,
      reason: `Net profit ${netProfit.toFixed(6)} ≤ min ${minProfit}`,
    };
  }

  if (Math.abs(slippageBuy) > maxSlippage) {
    return {
      profitable: false,
      reason: `Buy slippage ${(slippageBuy * 100).toFixed(3)}% exceeds max ${(maxSlippage * 100).toFixed(2)}%`,
    };
  }

  if (Math.abs(slippageSell) > maxSlippage) {
    return {
      profitable: false,
      reason: `Sell slippage ${(slippageSell * 100).toFixed(3)}% exceeds max ${(maxSlippage * 100).toFixed(2)}%`,
    };
  }

  return { profitable: true };
}