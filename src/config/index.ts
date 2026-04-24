// config/index.ts
/**
 * Завантаження та валідація конфігурації
 *
 * Пріоритет: CLI args > .env > дефолт
 */

import { config as dotenvConfig } from 'dotenv';
import { ZodError } from 'zod';
import { ConfigSchema, Config, DEFAULT_VALUES } from './schema';

// Завантаження .env (викликається один раз при імпорті модуля)
dotenvConfig();

// ---------------------------------------------------------------------------
// Внутрішні хелпери
// ---------------------------------------------------------------------------

/**
 * Безпечне читання числа з рядка.
 * Повертає undefined якщо рядок відсутній або не є числом.
 */
function parseIntSafe(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

function parseFloatSafe(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = parseFloat(value);
  return isNaN(n) ? undefined : n;
}

function parseBoolSafe(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value === 'true';
}

/**
 * Завантаження значень з process.env.
 * Повертає тільки поля, які явно присутні в env — решта залишається undefined
 * щоб не перекривати дефолти Zod.
 */
function loadFromEnv(): Partial<Config> {
  return Object.fromEntries(
    Object.entries({
      rpcUrl: process.env.RPC_URL,
      mintA: process.env.MINT_A,
      mintB: process.env.MINT_B,
      quoteMint: process.env.QUOTE_MINT,
      pollingIntervalMs: parseIntSafe(process.env.POLLING_INTERVAL_MS),
      minProfitThreshold: parseFloatSafe(process.env.MIN_PROFIT_THRESHOLD),
      tradeSize: parseFloatSafe(process.env.TRADE_SIZE),
      maxSlippagePercent: parseFloatSafe(process.env.MAX_SLIPPAGE_PERCENT),
      txCostInQuote: parseFloatSafe(process.env.TX_COST_IN_QUOTE),
      logLevel: process.env.LOG_LEVEL,
      logToFile: parseBoolSafe(process.env.LOG_TO_FILE),
      maxOpportunitiesDisplay: parseIntSafe(process.env.MAX_OPPORTUNITIES_DISPLAY),
      showSlippage: parseBoolSafe(process.env.SHOW_SLIPPAGE),
      maxPoolsToMonitor: parseIntSafe(process.env.MAX_POOLS_TO_MONITOR),
      rpcRetries: parseIntSafe(process.env.RPC_RETRIES),
      rpcRetryDelayMs: parseIntSafe(process.env.RPC_RETRY_DELAY_MS),
    }).filter(([, v]) => v !== undefined),
  ) as Partial<Config>;
}

// ---------------------------------------------------------------------------
// Публічний API
// ---------------------------------------------------------------------------

let cachedConfig: Config | null = null;

/**
 * Завантаження та валідація конфігурації.
 *
 * @param cliOverrides — значення з CLI (найвищий пріоритет)
 */
export function loadConfig(cliOverrides?: Partial<Config>): Config {
  const merged = {
    ...loadFromEnv(),
    ...(cliOverrides ?? {}),
  };

  try {
    // ConfigSchema.parse застосовує дефолти Zod для відсутніх полів
    const validated = ConfigSchema.parse(merged);
    cachedConfig = validated;
    return validated;
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Configuration is invalid:\n${issues}`);
    }
    throw error;
  }
}

/**
 * Отримання кешованої конфігурації (singleton).
 * Якщо конфіг ще не завантажено — завантажує з env + дефолтів.
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Скидання кешу (використовується в тестах).
 */
export function resetConfig(): void {
  cachedConfig = null;
}

// Re-export типів щоб споживачі не імпортували напряму зі schema
export { ConfigSchema, type Config, DEFAULT_VALUES } from './schema';