/**
 * src/core/pricing.ts
 *
 * Відповідальність:
 * - Чиста математика для CPMM (Constant Product Market Maker)
 * - Розрахунок spot price
 * - Симуляція свапів з урахуванням fee
 *
 * ВАЖЛИВО:
 * - Ніякого RPC
 * - Ніякого Raydium SDK
 * - Ніяких side effects
 *
 * Цей модуль має бути 100% детермінованим і тестованим.
 */

import {
    add,
    sub,
    mul,
    div,
  } from "../utils/math"
  
  /**
   * Базова структура пулу (domain model)
   *
   * reserveA / reserveB:
   * - сирі значення з блокчейну (lamports / smallest units)
   *
   * decimals:
   * - потрібні для нормалізації
   *
   * fee:
   * - у вигляді дробу (0.003 = 0.3%)
   */
  export type Pool = {
    address: string
  
    tokenA: string
    tokenB: string
  
    reserveA: number
    reserveB: number
  
    decimalsA: number
    decimalsB: number
  
    fee: number
  }
  
  /**
   * Нормалізація значення з урахуванням decimals
   *
   * Наприклад:
   * 1_000_000 (USDC, 6 decimals) → 1
   */
  export function normalizeAmount(
    amount: number,
    decimals: number
  ): number {
    return div(amount, Math.pow(10, decimals))
  }
  
  /**
   * Обчислення spot price (теоретична ціна)
   *
   * Це НЕ враховує:
   * - slippage
   * - розмір угоди
   *
   * Формула:
   * price = reserveB / reserveA
   *
   * Повертає:
   * - ціну токена A в токені B
   */
  export function getSpotPrice(pool: Pool): number {
    if (pool.reserveA === 0) return 0
  
    return div(pool.reserveB, pool.reserveA)
  }
  
  /**
   * Нормалізована ціна (з урахуванням decimals)
   *
   * Це те, що потрібно використовувати для:
   * - порівняння пулів
   * - arbitrage detection (на базовому рівні)
   */
  export function getNormalizedPrice(pool: Pool): number {
    const reserveA = normalizeAmount(pool.reserveA, pool.decimalsA)
    const reserveB = normalizeAmount(pool.reserveB, pool.decimalsB)
  
    if (reserveA === 0) return 0
  
    return div(reserveB, reserveA)
  }
  
  /**
   * Основна формула CPMM (x * y = k)
   *
   * Розрахунок amountOut з урахуванням fee
   *
   * Формула:
   * amountInWithFee = amountIn * (1 - fee)
   *
   * amountOut =
   *   (amountInWithFee * reserveOut)
   *   /
   *   (reserveIn + amountInWithFee)
   *
   * Параметри:
   * - amountIn: кількість токена, який ми вводимо
   * - reserveIn: резерв вхідного токена
   * - reserveOut: резерв вихідного токена
   * - fee: комісія (наприклад 0.003)
   */
  export function getAmountOut(
    amountIn: number,
    reserveIn: number,
    reserveOut: number,
    fee: number
  ): number {
    if (amountIn <= 0) return 0
    if (reserveIn <= 0 || reserveOut <= 0) return 0
  
    // amountIn після комісії
    const amountInWithFee = mul(amountIn, sub(1, fee))
  
    const numerator = mul(amountInWithFee, reserveOut)
    const denominator = add(reserveIn, amountInWithFee)
  
    return div(numerator, denominator)
  }
  
  /**
   * Execution price (реальна ціна угоди)
   *
   * На відміну від spot price:
   * - враховує slippage
   *
   * Формула:
   * executionPrice = amountOut / amountIn
   */
  export function getExecutionPrice(
    amountIn: number,
    amountOut: number
  ): number {
    if (amountIn === 0) return 0
  
    return div(amountOut, amountIn)
  }
  
  /**
   * Симуляція свапу A → B
   *
   * Використовує сирі reserve значення (без нормалізації)
   *
   * ВАЖЛИВО:
   * amountIn має бути в тих же одиницях, що і reserveA
   */
  export function simulateSwapAtoB(
    pool: Pool,
    amountIn: number
  ): number {
    return getAmountOut(
      amountIn,
      pool.reserveA,
      pool.reserveB,
      pool.fee
    )
  }
  
  /**
   * Симуляція свапу B → A
   */
  export function simulateSwapBtoA(
    pool: Pool,
    amountIn: number
  ): number {
    return getAmountOut(
      amountIn,
      pool.reserveB,
      pool.reserveA,
      pool.fee
    )
  }
  
  /**
   * Допоміжна функція:
   * симуляція повного циклу (A → B → A) через 2 пули
   *
   * Це вже ближче до arbitrage, але зручно мати тут
   *
   * Повертає:
   * - фінальну кількість токена A
   */
  export function simulateTwoHopArbitrage(
    poolBuy: Pool,   // де купуємо B за A
    poolSell: Pool,  // де продаємо B назад в A
    amountIn: number
  ): number {
    // A → B
    const amountB = simulateSwapAtoB(poolBuy, amountIn)
  
    // B → A
    const amountAOut = simulateSwapBtoA(poolSell, amountB)
  
    return amountAOut
  }
  
  /**
   * Розрахунок profit (без урахування network fees)
   *
   * profit = output - input
   */
  export function calculateProfit(
    amountIn: number,
    amountOut: number
  ): number {
    return sub(amountOut, amountIn)
  }
  
  /**
   * Перевірка, чи є сенс у свапі
   *
   * Мінімальний захист від шуму
   */
  export function isProfitable(
    profit: number,
    minProfit: number
  ): boolean {
    return profit > minProfit
  }
  
  /**
   * Експорт публічного API модуля
   */
  export default {
    getSpotPrice,
    getNormalizedPrice,
    getAmountOut,
    getExecutionPrice,
    simulateSwapAtoB,
    simulateSwapBtoA,
    simulateTwoHopArbitrage,
    calculateProfit,
    isProfitable,
  }