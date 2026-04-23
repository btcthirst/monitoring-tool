/**
 * src/core/arbitrage.ts
 *
 * Відповідальність:
 * - Пошук арбітражних можливостей між пулами
 * - Використання реальної симуляції свапів (через CPMM)
 * - Розрахунок net profit
 *
 * ВАЖЛИВО:
 * - НЕ використовує RPC
 * - НЕ залежить від Raydium SDK
 * - Працює тільки з даними (Pool[])
 *
 * Це чистий domain logic.
 */

import {
    simulateTwoHopArbitrage,
    calculateProfit,
  } from "./pricing"
  
  import { Pool } from "./pricing"
  
  /**
   * Результат арбітражу
   */
  export type Opportunity = {
    poolBuy: Pool        // де купуємо (A → B)
    poolSell: Pool       // де продаємо назад (B → A)
  
    amountIn: number     // вхідна сума (A)
    amountOut: number    // фінальна сума (A)
  
    profit: number       // чистий прибуток
    profitPercent: number
  
    timestamp: number
  }
  
  /**
   * Конфіг для арбітражу
   */
  export type ArbitrageConfig = {
    tradeSize: number     // фіксований розмір угоди
    minProfit: number     // мінімальний прибуток (absolute)
  }
  
  /**
   * Основна функція пошуку арбітражу
   *
   * Алгоритм:
   * 1. Перебираємо всі пари пулів (O(n^2))
   * 2. Для кожної пари:
   *    - симулюємо A → B → A
   * 3. Рахуємо profit
   * 4. Фільтруємо по threshold
   */
  export function findArbitrageOpportunities(
    pools: Pool[],
    config: ArbitrageConfig
  ): Opportunity[] {
    const opportunities: Opportunity[] = []
  
    const { tradeSize, minProfit } = config
  
    if (pools.length < 2) return opportunities
  
    for (let i = 0; i < pools.length; i++) {
      for (let j = 0; j < pools.length; j++) {
        if (i === j) continue
  
        const poolBuy = pools[i]
        const poolSell = pools[j]
  
        /**
         * Критично:
         * Перевіряємо, що пули сумісні (однакова пара токенів)
         *
         * Інакше буде garbage результат
         */
        if (!isSamePair(poolBuy, poolSell)) continue
  
        /**
         * Симуляція:
         * A → B → A
         */
        const amountOut = simulateTwoHopArbitrage(
          poolBuy,
          poolSell,
          tradeSize
        )
  
        const profit = calculateProfit(tradeSize, amountOut)
  
        /**
         * Фільтр по мінімальному прибутку
         */
        if (profit <= minProfit) continue
  
        const opportunity: Opportunity = {
          poolBuy,
          poolSell,
          amountIn: tradeSize,
          amountOut,
          profit,
          profitPercent: (profit / tradeSize) * 100,
          timestamp: Date.now(),
        }
  
        opportunities.push(opportunity)
      }
    }
  
    /**
     * Сортуємо за прибутком (найкращі зверху)
     */
    return opportunities.sort((a, b) => b.profit - a.profit)
  }
  
  /**
   * Перевірка, що пули мають однакову пару токенів
   *
   * Враховує:
   * - A/B
   * - B/A
   */
  function isSamePair(a: Pool, b: Pool): boolean {
    return (
      (a.tokenA === b.tokenA && a.tokenB === b.tokenB) ||
      (a.tokenA === b.tokenB && a.tokenB === b.tokenA)
    )
  }
  
  /**
   * Додатковий helper:
   * повертає тільки топ-N можливостей
   */
  export function getTopOpportunities(
    opportunities: Opportunity[],
    limit: number
  ): Opportunity[] {
    return opportunities.slice(0, limit)
  }
  
  /**
   * Додатковий helper:
   * агресивна фільтрація шуму
   */
  export function filterOpportunities(
    opportunities: Opportunity[],
    minProfitPercent: number
  ): Opportunity[] {
    return opportunities.filter(
      (op) => op.profitPercent >= minProfitPercent
    )
  }