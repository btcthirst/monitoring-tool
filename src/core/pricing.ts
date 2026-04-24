// core/pricing.ts
/**
 * Чиста математика для CPMM (Constant Product Market Maker).
 *
 * Правила модуля:
 * - Жодних side effects, жодних залежностей від Solana/RPC/logger
 * - Всі функції — чисті (pure)
 * - bigint для сирих даних з блокчейну, number для розрахунків
 */

import { RawPool, NormalizedPool, ValidationResult } from './types';

// ---------------------------------------------------------------------------
// Конвертація між bigint та number
// ---------------------------------------------------------------------------

/**
 * Нормалізація суми з bigint в number з урахуванням decimals.
 *
 * @throws {Error} якщо ціла частина перевищує MAX_SAFE_INTEGER
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
 * Конвертація number назад у bigint з урахуванням decimals.
 *
 * @throws {Error} якщо перетворення втрачає точність
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
// Валідація
// ---------------------------------------------------------------------------

/**
 * Перевірка резервів пулу перед розрахунками.
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
 * Перевірка розміру угоди відносно ліквідності пулу.
 * За замовчуванням угода не повинна перевищувати 10% резерву.
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
// Нормалізація пулу
// ---------------------------------------------------------------------------

/**
 * Перетворення RawPool → NormalizedPool.
 * Конвертує bigint резерви в number та fee з bps у десятковий дріб.
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
// Ціноутворення
// ---------------------------------------------------------------------------

/**
 * Spot price: скільки tokenB дає один tokenA (без впливу на ціну).
 * Повертає 0 якщо резерв A нульовий.
 */
export function getSpotPrice(pool: NormalizedPool): number {
  if (pool.reserveA === 0) return 0;
  return pool.reserveB / pool.reserveA;
}

// ---------------------------------------------------------------------------
// CPMM формула свапу
// ---------------------------------------------------------------------------

/**
 * Розрахунок вихідної суми за формулою CPMM:
 *
 *   amountOut = (amountIn × (1 − fee) × reserveOut)
 *             / (reserveIn + amountIn × (1 − fee))
 *
 * Повертає 0 при невалідних вхідних даних замість виключення —
 * caller (arbitrage.ts) вирішує що робити з нульовим результатом.
 *
 * @throws {Error} тільки при невалідному fee (програмна помилка)
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
 * Симуляція свапу A → B в межах одного пулу.
 */
export function simulateSwapAtoB(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveA, pool.reserveB, pool.fee);
}

/**
 * Симуляція свапу B → A в межах одного пулу.
 */
export function simulateSwapBtoA(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveB, pool.reserveA, pool.fee);
}

// ---------------------------------------------------------------------------
// Двох-hop арбітраж
// ---------------------------------------------------------------------------

/**
 * Симуляція арбітражу через два пули: A → B (buyPool) → A (sellPool).
 *
 * Slippage розраховується як відносне відхилення від spot price:
 *   slippage = (actualOut − expectedOut) / expectedOut
 * Від'ємне значення означає що отримали менше за spot (нормальна ситуація).
 *
 * @returns amountOut — сума A після обох свапів
 * @returns slippageBuy — відносне відхилення на першому свапі
 * @returns slippageSell — відносне відхилення на другому свапі
 */
export function simulateTwoHopArbitrage(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  amountIn: number,
): { amountOut: number; slippageBuy: number; slippageSell: number } {
  const spotBuy = getSpotPrice(buyPool);   // B per A
  const spotSell = getSpotPrice(sellPool); // B per A

  // Hop 1: A → B через buyPool
  const amountIntermediate = simulateSwapAtoB(buyPool, amountIn);

  // Slippage на купівлі
  const expectedIntermediate = spotBuy === 0 ? 0 : amountIn * spotBuy;
  const slippageBuy =
    expectedIntermediate === 0
      ? 0
      : (amountIntermediate - expectedIntermediate) / expectedIntermediate;

  // Hop 2: B → A через sellPool
  const amountOut = simulateSwapBtoA(sellPool, amountIntermediate);

  // Slippage на продажу
  const expectedOut = spotSell === 0 ? 0 : amountIntermediate / spotSell;
  const slippageSell =
    expectedOut === 0
      ? 0
      : (amountOut - expectedOut) / expectedOut;

  return { amountOut, slippageBuy, slippageSell };
}

// ---------------------------------------------------------------------------
// Розрахунок прибутку
// ---------------------------------------------------------------------------

/** Валовий прибуток = amountOut − amountIn */
export function calculateGrossProfit(amountIn: number, amountOut: number): number {
  return amountOut - amountIn;
}

/** Чистий прибуток = grossProfit − txCost */
export function calculateNetProfit(grossProfit: number, txCost: number): number {
  return grossProfit - txCost;
}

/** Відсоток прибутку відносно вхідної суми */
export function calculateProfitPercent(profit: number, amountIn: number): number {
  if (amountIn === 0) return 0;
  return (profit / amountIn) * 100;
}

/**
 * Перевірка прибутковості угоди з урахуванням slippage.
 * Використовує maxSlippage як десятковий дріб (0.05 = 5%).
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