// core/types.ts
/**
 * Чисті доменні типи для арбітражного модуля
 * Не містять залежностей від Solana/RPC
 */

/**
 * Сирий пул з блокчейну (з bigint)
 */
export type RawPool = {
    address: string;
    tokenA: string;
    tokenB: string;
    reserveA: bigint;
    reserveB: bigint;
    decimalsA: number;
    decimalsB: number;
    feeBps: number;        // fee in basis points (25 = 0.25%)
  };
  
  /**
   * Нормалізований пул (з number для розрахунків)
   */
  export type NormalizedPool = {
    address: string;
    tokenA: string;
    tokenB: string;
    reserveA: number;      // після нормалізації
    reserveB: number;      // після нормалізації
    fee: number;           // 0.0025
    decimalsA: number;
    decimalsB: number;
  };
  
  /**
   * Конфігурація арбітражу
   */
  export type ArbitrageConfig = {
    tradeSize: number;        // в нормалізованих одиницях (наприклад 1000 USDC)
    minProfit: number;        // мінімальний чистий прибуток
    maxSlippagePercent: number; // максимальне прослизання (0.05 = 5%)
    txCostInQuote: number;    // вартість транзакції в quote токені
    quoteMint: string;        // mint address quote токена (для tx cost)
  };
  
  /**
   * Арбітражна можливість
   */
  export type Opportunity = {
    buyPool: NormalizedPool;
    sellPool: NormalizedPool;
    amountIn: number;         // вхідна сума (quote токен)
    amountOut: number;        // вихідна сума (quote токен)
    grossProfit: number;      // валовий прибуток (без tx cost)
    txCost: number;           // вартість транзакції
    netProfit: number;        // чистий прибуток
    profitPercent: number;    // відсоток прибутку
    slippageBuy: number;      // прослизання на купівлі
    slippageSell: number;     // прослизання на продажі
    timestamp: number;
  };
  
  /**
   * Результат валідації угоди
   */
  export type ValidationResult = {
    isValid: boolean;
    error?: string;
    maxAmount?: number;
  };