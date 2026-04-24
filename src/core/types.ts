// core/types.ts
/**
 * Чисті доменні типи для арбітражного модуля.
 * Не містять залежностей від Solana/RPC.
 */

// ---------------------------------------------------------------------------
// Пул
// ---------------------------------------------------------------------------

/**
 * Сирий пул з блокчейну.
 * Резерви зберігаються як bigint (lamports / raw units).
 */
export type RawPool = {
  address: string;
  tokenA: string;
  tokenB: string;
  reserveA: bigint;
  reserveB: bigint;
  decimalsA: number;
  decimalsB: number;
  /** Комісія в basis points (25 = 0.25%) */
  feeBps: number;
};

/**
 * Нормалізований пул.
 * Резерви конвертовані в number з урахуванням decimals — готові до математики.
 */
export type NormalizedPool = {
  address: string;
  tokenA: string;
  tokenB: string;
  /** Резерв токена A в нормалізованих одиницях */
  reserveA: number;
  /** Резерв токена B в нормалізованих одиницях */
  reserveB: number;
  /** Комісія як десятковий дріб (0.0025 = 0.25%) */
  fee: number;
  decimalsA: number;
  decimalsB: number;
};

// ---------------------------------------------------------------------------
// Конфігурація арбітражу
// ---------------------------------------------------------------------------

/**
 * Параметри для пошуку та оцінки арбітражних можливостей.
 * Всі суми — в нормалізованих одиницях quote токена.
 */
export type ArbitrageConfig = {
  /** Розмір симульованої угоди (наприклад 100 USDC) */
  tradeSize: number;
  /** Мінімальний чистий прибуток для сигналу */
  minProfit: number;
  /**
   * Максимально допустиме прослизання як десятковий дріб.
   * 0.05 = 5%. Перевіряється окремо для buy і sell свапу.
   */
  maxSlippage: number;
  /** Вартість транзакції в quote токені (враховується в net profit) */
  txCostInQuote: number;
  /** Mint address quote токена (для контексту логування та UI) */
  quoteMint: string;
};

// ---------------------------------------------------------------------------
// Результат арбітражу
// ---------------------------------------------------------------------------

/**
 * Арбітражна можливість — результат симуляції двох свапів.
 */
export type Opportunity = {
  buyPool: NormalizedPool;
  sellPool: NormalizedPool;
  /** Вхідна сума в quote токені */
  amountIn: number;
  /** Вихідна сума в quote токені після обох свапів */
  amountOut: number;
  /** Валовий прибуток = amountOut - amountIn (до вирахування tx cost) */
  grossProfit: number;
  /** Вартість транзакції (з конфігурації) */
  txCost: number;
  /** Чистий прибуток = grossProfit - txCost */
  netProfit: number;
  /** Чистий прибуток відносно amountIn, у відсотках */
  profitPercent: number;
  /**
   * Відносне прослизання на buy свапі.
   * Від'ємне значення = отримали менше ніж spot price.
   * Наприклад: -0.003 = -0.3%
   */
  slippageBuy: number;
  /** Відносне прослизання на sell свапі (аналогічно slippageBuy) */
  slippageSell: number;
  /** Unix timestamp (ms) моменту розрахунку */
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Допоміжні типи
// ---------------------------------------------------------------------------

/**
 * Результат валідації.
 * Використовується там де помилка не є винятком (м'яка перевірка).
 */
export type ValidationResult =
  | { isValid: true; maxAmount?: number }
  | { isValid: false; error: string; maxAmount?: number };

/**
 * Статистика по набору можливостей.
 */
export type OpportunityStats = {
  count: number;
  maxProfit: number;
  avgProfit: number;
  totalVolume: number;
};