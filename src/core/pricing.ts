// core/pricing.ts
/**
 * Чиста математика для CPMM (Constant Product Market Maker)
 * - Всі операції з великими числами через bigint
 * - Перевірки на переповнення
 * - Симуляція свапів з урахуванням fee
 * - Ніяких side effects
 */

import { RawPool, NormalizedPool, ValidationResult } from './types';

/**
 * Нормалізація значення з bigint в number з урахуванням decimals
 * @throws {Error} якщо число занадто велике для number
 */
export function normalizeAmount(amount: bigint, decimals: number): number {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  // Перевірка на переповнення (max safe integer в JS ≈ 9e15)
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (integerPart > maxSafe) {
    throw new Error(`Amount ${amount} exceeds MAX_SAFE_INTEGER after normalization`);
  }
  
  const fractional = Number(fractionalPart) / Number(divisor);
  return Number(integerPart) + fractional;
}

/**
 * Конвертація number в bigint з урахуванням decimals
 * @throws {Error} якщо число має занадто багато знаків після коми
 */
export function denormalizeAmount(amount: number, decimals: number): bigint {
  const multiplier = BigInt(10 ** decimals);
  const amountStr = amount.toFixed(decimals);
  const [integer, fraction = ''] = amountStr.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0');
  const fullAmountStr = integer + paddedFraction;
  
  try {
    return BigInt(fullAmountStr);
  } catch (error) {
    throw new Error(`Failed to denormalize amount ${amount} with decimals ${decimals}`);
  }
}

/**
 * Перевірка безпеки резервів (немає переповнення при множенні)
 */
export function validateReserves(reserveA: bigint, reserveB: bigint): ValidationResult {
  if (reserveA === 0n || reserveB === 0n) {
    return { isValid: false, error: 'Zero reserve detected' };
  }
  
  // Перевірка, що множення не викличе переповнення
  // max bigint практично необмежений, але перевіряємо логічні межі
  const maxProduct = 2n ** 256n; // 2^256 - практичний ліміт для Solana
  if (reserveA * reserveB > maxProduct) {
    return { isValid: false, error: 'Reserve product exceeds safe limit' };
  }
  
  return { isValid: true };
}

/**
 * Нормалізація пулу (перетворення RawPool → NormalizedPool)
 */
export function normalizePool(rawPool: RawPool): NormalizedPool {
  const reserveA = normalizeAmount(rawPool.reserveA, rawPool.decimalsA);
  const reserveB = normalizeAmount(rawPool.reserveB, rawPool.decimalsB);
  
  return {
    address: rawPool.address,
    tokenA: rawPool.tokenA,
    tokenB: rawPool.tokenB,
    reserveA,
    reserveB,
    fee: rawPool.feeBps / 10000,
    decimalsA: rawPool.decimalsA,
    decimalsB: rawPool.decimalsB,
  };
}

/**
 * Отримання spot price (теоретична ціна без slippage)
 */
export function getSpotPrice(pool: NormalizedPool): number {
  if (pool.reserveA === 0) return 0;
  return pool.reserveB / pool.reserveA;
}

/**
 * Нормалізована ціна (вже враховує decimals через NormalizedPool)
 */
export function getNormalizedPrice(pool: NormalizedPool): number {
  return getSpotPrice(pool);
}

/**
 * Основна формула CPMM для розрахунку вихідної суми
 * 
 * Формула:
 * amountOut = (amountIn * (1 - fee) * reserveOut) / (reserveIn + amountIn * (1 - fee))
 * 
 * @throws {Error} при переповненні або невалідних значеннях
 */
export function getAmountOut(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  fee: number
): number {
  // Валідація вхідних даних
  if (amountIn <= 0) return 0;
  if (reserveIn <= 0 || reserveOut <= 0) return 0;
  if (fee < 0 || fee >= 1) {
    throw new Error(`Invalid fee: ${fee}`);
  }
  
  // Перевірка, що amountIn не більше 10% від резерву (запобігання вбивству пулу)
  const maxAmountIn = reserveIn * 0.1;
  if (amountIn > maxAmountIn) {
    throw new Error(`Amount in ${amountIn} exceeds 10% of reserve ${reserveIn}`);
  }
  
  // Розрахунок з перевіркою на переповнення
  const amountInWithFee = amountIn * (1 - fee);
  
  // Перевірка потенційного переповнення при множенні
  if (amountInWithFee > Number.MAX_SAFE_INTEGER / reserveOut) {
    throw new Error('Potential overflow in amountOut calculation');
  }
  
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}

/**
 * Симуляція свапу A → B
 */
export function simulateSwapAtoB(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveA, pool.reserveB, pool.fee);
}

/**
 * Симуляція свапу B → A
 */
export function simulateSwapBtoA(pool: NormalizedPool, amountIn: number): number {
  return getAmountOut(amountIn, pool.reserveB, pool.reserveA, pool.fee);
}

/**
 * Симуляція двох-hop арбітражу A → B → A через два пули
 * 
 * @param buyPool - де купуємо B за A
 * @param sellPool - де продаємо B назад в A
 * @param amountIn - вхідна сума A
 * @returns amountOut - вихідна сума A після обох свапів
 */
export function simulateTwoHopArbitrage(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  amountIn: number
): { amountOut: number; slippageBuy: number; slippageSell: number } {
  // Отримуємо spot ціни до свапу
  const spotPriceBuy = getSpotPrice(buyPool);
  const spotPriceSell = getSpotPrice(sellPool);
  
  // A → B через buyPool
  const amountIntermediate = simulateSwapAtoB(buyPool, amountIn);
  
  // Розрахунок прослизання на першому свапі
  const expectedIntermediate = amountIn * spotPriceBuy;
  const slippageBuy = expectedIntermediate === 0 ? 0 : 
    (amountIntermediate - expectedIntermediate) / expectedIntermediate;
  
  // B → A через sellPool
  const amountOut = simulateSwapBtoA(sellPool, amountIntermediate);
  
  // Розрахунок прослизання на другому свапі
  const expectedOut = amountIntermediate * (1 / spotPriceSell);
  const slippageSell = expectedOut === 0 ? 0 :
    (amountOut - expectedOut) / expectedOut;
  
  return { amountOut, slippageBuy, slippageSell };
}

/**
 * Розрахунок валового прибутку
 */
export function calculateGrossProfit(amountIn: number, amountOut: number): number {
  return amountOut - amountIn;
}

/**
 * Розрахунок чистого прибутку (з урахуванням tx cost)
 */
export function calculateNetProfit(
  grossProfit: number,
  txCost: number
): number {
  return grossProfit - txCost;
}

/**
 * Розрахунок відсотку прибутку
 */
export function calculateProfitPercent(profit: number, amountIn: number): number {
  if (amountIn === 0) return 0;
  return (profit / amountIn) * 100;
}

/**
 * Перевірка, чи є угода прибутковою з урахуванням slippage
 */
export function isProfitable(
  grossProfit: number,
  txCost: number,
  minProfit: number,
  maxSlippage: number,
  slippageBuy: number,
  slippageSell: number
): { profitable: boolean; reason?: string } {
  const netProfit = grossProfit - txCost;
  
  if (netProfit <= minProfit) {
    return { profitable: false, reason: `Net profit ${netProfit} <= ${minProfit}` };
  }
  
  if (Math.abs(slippageBuy) > maxSlippage) {
    return { profitable: false, reason: `Buy slippage ${slippageBuy} > ${maxSlippage}` };
  }
  
  if (Math.abs(slippageSell) > maxSlippage) {
    return { profitable: false, reason: `Sell slippage ${slippageSell} > ${maxSlippage}` };
  }
  
  return { profitable: true };
}

/**
 * Валідація розміру угоди (не більше X% від ліквідності)
 */
export function validateTradeSize(
  pool: NormalizedPool,
  amountIn: number,
  maxPercentOfPool: number = 0.1
): ValidationResult {
  const maxAmount = pool.reserveA * maxPercentOfPool;
  
  if (amountIn > maxAmount) {
    return {
      isValid: false,
      error: `Trade size ${amountIn} exceeds ${maxPercentOfPool * 100}% of pool liquidity (max: ${maxAmount})`,
      maxAmount,
    };
  }
  
  return { isValid: true, maxAmount };
}

// Експорт публічного API
export default {
  normalizeAmount,
  denormalizeAmount,
  validateReserves,
  normalizePool,
  getSpotPrice,
  getNormalizedPrice,
  getAmountOut,
  simulateSwapAtoB,
  simulateSwapBtoA,
  simulateTwoHopArbitrage,
  calculateGrossProfit,
  calculateNetProfit,
  calculateProfitPercent,
  isProfitable,
  validateTradeSize,
};