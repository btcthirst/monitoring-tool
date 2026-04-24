// core/arbitrage.ts
/**
 * Пошук арбітражних можливостей між пулами.
 *
 * Правила модуля:
 * - Жодних залежностей від Solana/RPC/logger/UI
 * - Тільки чиста бізнес-логіка
 * - Помилки пробрасуються вгору або повертають null — не логуються тут
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
// Хелпери для роботи з парами пулів
// ---------------------------------------------------------------------------

/**
 * Перевірка що два пули торгують однаковою парою токенів
 * (незалежно від порядку tokenA/tokenB).
 */
export function isSamePair(a: NormalizedPool, b: NormalizedPool): boolean {
  return (
    (a.tokenA === b.tokenA && a.tokenB === b.tokenB) ||
    (a.tokenA === b.tokenB && a.tokenB === b.tokenA)
  );
}

/**
 * Канонічний ключ пари токенів (відсортовані адреси через ':').
 * Використовується для групування пулів.
 */
function pairKey(tokenA: string, tokenB: string): string {
  return [tokenA, tokenB].sort().join(':');
}

// ---------------------------------------------------------------------------
// Головна функція
// ---------------------------------------------------------------------------

/**
 * Знаходження всіх арбітражних можливостей серед масиву пулів.
 *
 * Алгоритм:
 * 1. Нормалізуємо всі пули (bigint → number)
 * 2. Групуємо за канонічним ключем пари токенів
 * 3. Для кожної групи перебираємо всі унікальні пари пулів (i, j)
 * 4. Перевіряємо обидва напрямки арбітражу
 * 5. Повертаємо відфільтровані та відсортовані можливості
 *
 * @param rawPools — сирі пули з блокчейну
 * @param config   — параметри арбітражу
 * @returns масив можливостей, відсортованих за netProfit (найкращі зверху)
 */
export function findArbitrageOpportunities(
  rawPools: RawPool[],
  config: ArbitrageConfig,
): Opportunity[] {
  if (rawPools.length < 2) return [];

  // Крок 1: нормалізація
  const pools: NormalizedPool[] = rawPools.map(normalizePool);

  // Крок 2: групування за парою
  const byPair = new Map<string, NormalizedPool[]>();
  for (const pool of pools) {
    const key = pairKey(pool.tokenA, pool.tokenB);
    const group = byPair.get(key) ?? [];
    group.push(pool);
    byPair.set(key, group);
  }

  // Крок 3–4: пошук можливостей
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

  // Крок 5: сортування
  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

// ---------------------------------------------------------------------------
// Оцінка одного напрямку
// ---------------------------------------------------------------------------

/**
 * Симуляція арбітражу: купуємо в buyPool, продаємо в sellPool.
 * Повертає Opportunity якщо угода прибуткова, інакше null.
 */
function evaluateDirection(
  buyPool: NormalizedPool,
  sellPool: NormalizedPool,
  config: ArbitrageConfig,
): Opportunity | null {
  if (!isSamePair(buyPool, sellPool)) return null;

  // Валідація розміру угоди для обох пулів
  const buyCheck = validateTradeSize(buyPool, config.tradeSize);
  const sellCheck = validateTradeSize(sellPool, config.tradeSize);

  if (!buyCheck.isValid || !sellCheck.isValid) return null;

  // Симуляція
  let result: ReturnType<typeof simulateTwoHopArbitrage>;
  try {
    result = simulateTwoHopArbitrage(buyPool, sellPool, config.tradeSize);
  } catch {
    // Математична помилка (наприклад, переповнення) — пропускаємо пару
    return null;
  }

  const { amountOut, slippageBuy, slippageSell } = result;

  // Розрахунок прибутку
  const grossProfit = calculateGrossProfit(config.tradeSize, amountOut);
  const netProfit = calculateNetProfit(grossProfit, config.txCostInQuote);
  const profitPercent = calculateProfitPercent(netProfit, config.tradeSize);

  // Фільтр прибутковості
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
// Утиліти для роботи з результатами
// ---------------------------------------------------------------------------

/**
 * Повертає перші N можливостей (масив вже відсортований).
 */
export function getTopOpportunities(opportunities: Opportunity[], limit: number): Opportunity[] {
  return opportunities.slice(0, limit);
}

/**
 * Фільтрація за мінімальним відсотком прибутку.
 */
export function filterByProfitPercent(
  opportunities: Opportunity[],
  minPercent: number,
): Opportunity[] {
  return opportunities.filter((o) => o.profitPercent >= minPercent);
}

/**
 * Групування можливостей за адресою buy pool.
 */
export function groupByBuyPool(opportunities: Opportunity[]): Map<string, Opportunity[]> {
  const grouped = new Map<string, Opportunity[]>();
  for (const opp of opportunities) {
    const group = grouped.get(opp.buyPool.address) ?? [];
    group.push(opp);
    grouped.set(opp.buyPool.address, group);
  }
  return grouped;
}

/**
 * Агрегована статистика по набору можливостей.
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