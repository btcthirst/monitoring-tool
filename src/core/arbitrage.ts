// core/arbitrage.ts
/**
 * Пошук арбітражних можливостей між пулами
 * - Використовує реальну симуляцію свапів
 * - Враховує tx costs
 * - Фільтрує за slippage та мінімальним прибутком
 */

import {
  RawPool,
  NormalizedPool,
  ArbitrageConfig,
  Opportunity,
  ValidationResult,
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

/**
 * Перевірка, що пули мають однакову пару токенів
 */
export function isSamePair(a: NormalizedPool, b: NormalizedPool): boolean {
  return (
    (a.tokenA === b.tokenA && a.tokenB === b.tokenB) ||
    (a.tokenA === b.tokenB && a.tokenB === b.tokenA)
  );
}

/**
 * Отримання порядку токенів для пулу відносно quote токена
 * Повертає напрямок свапу (true = прямий, false = зворотній)
 */
export function getSwapDirection(
  pool: NormalizedPool,
  quoteMint: string
): { isDirect: boolean; reserveIn: number; reserveOut: number } {
  if (pool.tokenA === quoteMint) {
    // Купуємо tokenB за quoteMint (прямий напрямок)
    return { isDirect: true, reserveIn: pool.reserveA, reserveOut: pool.reserveB };
  } else if (pool.tokenB === quoteMint) {
    // Купуємо tokenA за quoteMint (потрібен зворотній свап)
    return { isDirect: false, reserveIn: pool.reserveB, reserveOut: pool.reserveA };
  }
  
  throw new Error(`Quote token ${quoteMint} not found in pool`);
}

/**
 * Знаходження всіх арбітражних можливостей
 * 
 * Алгоритм:
 * 1. Нормалізуємо всі пули
 * 2. Групуємо за парою токенів
 * 3. Для кожної пари пулів симулюємо арбітраж
 * 4. Фільтруємо за прибутковістю
 * 
 * @param rawPools - масив сирих пулів з блокчейну
 * @param config - конфігурація арбітражу
 * @returns масив можливостей, відсортованих за net profit
 */
export function findArbitrageOpportunities(
  rawPools: RawPool[],
  config: ArbitrageConfig
): Opportunity[] {
  const opportunities: Opportunity[] = [];
  
  if (rawPools.length < 2) return opportunities;
  
  // Крок 1: Нормалізація всіх пулів
  const pools: NormalizedPool[] = rawPools.map(pool => normalizePool(pool));
  
  // Крок 2: Групування за парою токенів (оптимізація)
  const poolsByPair = new Map<string, NormalizedPool[]>();
  
  for (const pool of pools) {
    const sortedTokens = [pool.tokenA, pool.tokenB].sort();
    const key = `${sortedTokens[0]}:${sortedTokens[1]}`;
    
    if (!poolsByPair.has(key)) {
      poolsByPair.set(key, []);
    }
    poolsByPair.get(key)!.push(pool);
  }
  
  // Крок 3: Пошук арбітражу всередині кожної пари
  for (const [_, poolsOfPair] of poolsByPair) {
    if (poolsOfPair.length < 2) continue;
    
    // Перебираємо всі унікальні пари пулів
    for (let i = 0; i < poolsOfPair.length; i++) {
      for (let j = i + 1; j < poolsOfPair.length; j++) {
        const poolA = poolsOfPair[i];
        const poolB = poolsOfPair[j];
        
        // Спробуємо обидва напрямки арбітражу
        const opportunitiesFromPair = findOpportunitiesForPair(
          poolA,
          poolB,
          config
        );
        
        opportunities.push(...opportunitiesFromPair);
      }
    }
  }
  
  // Крок 4: Сортування за чистим прибутком (найкращі зверху)
  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Пошук можливостей для конкретної пари пулів (обидва напрямки)
 */
function findOpportunitiesForPair(
  poolA: NormalizedPool,
  poolB: NormalizedPool,
  config: ArbitrageConfig
): Opportunity[] {
  const opportunities: Opportunity[] = [];
  
  // Напрямок 1: Купуємо в poolA, продаємо в poolB
  const opp1 = evaluateArbitrageDirection(poolA, poolB, config);
  if (opp1) opportunities.push(opp1);
  
  // Напрямок 2: Купуємо в poolB, продаємо в poolA
  const opp2 = evaluateArbitrageDirection(poolB, poolA, config);
  if (opp2) opportunities.push(opp2);
  
  return opportunities;
}

/**
 * Оцінка одного напрямку арбітражу
 */
function evaluateArbitrageDirection(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  config: ArbitrageConfig
): Opportunity | null {
  // Перевіряємо, чи пули сумісні
  if (!isSamePair(buyPool, sellPool)) return null;
  
  // Валідація розміру угоди для обох пулів
  const buyValidation = validateTradeSize(buyPool, config.tradeSize);
  const sellValidation = validateTradeSize(sellPool, config.tradeSize);
  
  if (!buyValidation.isValid || !sellValidation.isValid) {
    return null;
  }
  
  try {
    // Симуляція арбітражу
    const { amountOut, slippageBuy, slippageSell } = simulateTwoHopArbitrage(
      buyPool,
      sellPool,
      config.tradeSize
    );
    
    // Розрахунок прибутку
    const grossProfit = calculateGrossProfit(config.tradeSize, amountOut);
    const netProfit = calculateNetProfit(grossProfit, config.txCostInQuote);
    const profitPercent = calculateProfitPercent(netProfit, config.tradeSize);
    
    // Перевірка прибутковості з урахуванням slippage
    const { profitable, reason } = isProfitable(
      grossProfit,
      config.txCostInQuote,
      config.minProfit,
      config.maxSlippagePercent,
      slippageBuy,
      slippageSell
    );
    
    if (!profitable) {
      return null;
    }
    
    // Створення об'єкту можливості
    const opportunity: Opportunity = {
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
    
    return opportunity;
  } catch (error) {
    // Логування помилки (через logger, але тут без залежностей)
    console.error(`Failed to evaluate arbitrage direction: ${error}`);
    return null;
  }
}

/**
 * Фільтрація можливостей за мінімальним відсотком прибутку
 */
export function filterByProfitPercent(
  opportunities: Opportunity[],
  minProfitPercent: number
): Opportunity[] {
  return opportunities.filter(opp => opp.profitPercent >= minProfitPercent);
}

/**
 * Отримання топ-N найкращих можливостей
 */
export function getTopOpportunities(
  opportunities: Opportunity[],
  limit: number
): Opportunity[] {
  return opportunities.slice(0, limit);
}

/**
 * Групування можливостей за пулами (для аналізу)
 */
export function groupOpportunitiesByPool(
  opportunities: Opportunity[]
): Map<string, Opportunity[]> {
  const grouped = new Map<string, Opportunity[]>();
  
  for (const opp of opportunities) {
    const key = opp.buyPool.address;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(opp);
  }
  
  return grouped;
}

/**
 * Агрегована статистика по можливостям
 */
export function getOpportunityStats(opportunities: Opportunity[]): {
  count: number;
  maxProfit: number;
  avgProfit: number;
  totalVolume: number;
} {
  if (opportunities.length === 0) {
    return { count: 0, maxProfit: 0, avgProfit: 0, totalVolume: 0 };
  }
  
  const profits = opportunities.map(opp => opp.netProfit);
  const totalVolume = opportunities.reduce((sum, opp) => sum + opp.amountIn, 0);
  
  return {
    count: opportunities.length,
    maxProfit: Math.max(...profits),
    avgProfit: profits.reduce((a, b) => a + b, 0) / profits.length,
    totalVolume,
  };
}

// Експорт публічного API
export default {
  findArbitrageOpportunities,
  isSamePair,
  getSwapDirection,
  filterByProfitPercent,
  getTopOpportunities,
  groupOpportunitiesByPool,
  getOpportunityStats,
};