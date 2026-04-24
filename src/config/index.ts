// config/index.ts
/**
 * Завантаження та валідація конфігурації
 * 
 * Пріоритет: CLI args > .env > дефолт
 */

import { config as dotenvConfig } from 'dotenv';
import { ConfigSchema, Config, DEFAULT_VALUES } from './schema';
import { logger } from '../logger/logger';
import { ZodError } from 'zod';

// Завантаження .env
dotenvConfig();

/**
 * Парсинг CLI аргументів (простий без додаткових бібліотек)
 */
export function parseCliArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const result: Partial<Config> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--rpc':
      case '-r':
        result.rpcUrl = args[++i];
        break;
      case '--mint-a':
        result.mintA = args[++i];
        break;
      case '--mint-b':
        result.mintB = args[++i];
        break;
      case '--quote':
        result.quoteMint = args[++i];
        break;
      case '--interval':
      case '-i':
        result.pollingIntervalMs = parseInt(args[++i]);
        break;
      case '--min-profit':
      case '-p':
        result.minProfitThreshold = parseFloat(args[++i]);
        break;
      case '--trade-size':
      case '-s':
        result.tradeSize = parseFloat(args[++i]);
        break;
      case '--log-level':
      case '-l':
        result.logLevel = args[++i] as any;
        break;
    }
  }
  
  return result;
}

/**
 * Завантаження з .env
 */
function loadFromEnv(): Partial<Config> {
  return {
    rpcUrl: process.env.RPC_URL,
    mintA: process.env.MINT_A,
    mintB: process.env.MINT_B,
    quoteMint: process.env.QUOTE_MINT,
    pollingIntervalMs: process.env.POLLING_INTERVAL_MS ? parseInt(process.env.POLLING_INTERVAL_MS) : undefined,
    minProfitThreshold: process.env.MIN_PROFIT_THRESHOLD ? parseFloat(process.env.MIN_PROFIT_THRESHOLD) : undefined,
    tradeSize: process.env.TRADE_SIZE ? parseFloat(process.env.TRADE_SIZE) : undefined,
    maxSlippagePercent: process.env.MAX_SLIPPAGE_PERCENT ? parseFloat(process.env.MAX_SLIPPAGE_PERCENT) : undefined,
    txCostInQuote: process.env.TX_COST_IN_QUOTE ? parseFloat(process.env.TX_COST_IN_QUOTE) : undefined,
    logLevel: process.env.LOG_LEVEL as any,
    logToFile: process.env.LOG_TO_FILE === 'true',
    maxPoolsToMonitor: process.env.MAX_POOLS_TO_MONITOR ? parseInt(process.env.MAX_POOLS_TO_MONITOR) : undefined,
  };
}

/**
 * Дефолтна конфігурація
 */
const defaultConfig: Config = {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  mintA: DEFAULT_VALUES.mintA,
  mintB: DEFAULT_VALUES.mintB,
  quoteMint: DEFAULT_VALUES.quoteMint,
  pollingIntervalMs: 2000,
  minProfitThreshold: 0.01,
  tradeSize: 100,
  maxSlippagePercent: 0.05,
  txCostInQuote: 0.0002,
  logLevel: 'info',
  logToFile: true,
  maxOpportunitiesDisplay: 15,
  showSlippage: true,
  maxPoolsToMonitor: 50,
  rpcRetries: 3,
  rpcRetryDelayMs: 1000,
};

let cachedConfig: Config | null = null;

/**
 * Головна функція завантаження конфігурації
 */
export function loadConfig(cliOverrides?: Partial<Config>): Config {
  const envConfig = loadFromEnv();
  const cliConfig = cliOverrides || parseCliArgs();
  
  const merged = {
    ...defaultConfig,
    ...envConfig,
    ...cliConfig,
  };
  
  try {
    const validated = ConfigSchema.parse(merged);
    
    // Логуємо (приховуючи API ключі)
    logger.info('Configuration loaded', {
      rpcUrl: validated.rpcUrl.replace(/\/\/.*@/, '//***@'),
      mintA: validated.mintA.slice(0, 8),
      mintB: validated.mintB.slice(0, 8),
      pollingIntervalMs: validated.pollingIntervalMs,
      minProfitThreshold: validated.minProfitThreshold,
    });
    
    cachedConfig = validated;
    return validated;
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid config: ${issues.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Отримання кешованої конфігурації (сінглтон)
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Скидання кешу (для тестів)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Валідація адрес токенів
 */
export function validateAddresses(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.mintA.length !== 44) errors.push('mintA invalid length');
  if (config.mintB.length !== 44) errors.push('mintB invalid length');
  if (config.quoteMint.length !== 44) errors.push('quoteMint invalid length');
  
  return { valid: errors.length === 0, errors };
}

// Експорт всього необхідного
export { ConfigSchema, type Config, DEFAULT_VALUES } from './schema';