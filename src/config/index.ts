// config/index.ts
/**
 * Load and validate configuration
 *
 * Priority: CLI args > .env > defaults
 */

import { config as dotenvConfig } from 'dotenv';
import { ZodError } from 'zod';
import { ConfigSchema, Config, DEFAULT_VALUES } from './schema';

// Load .env (called once on module import)
dotenvConfig();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a number from a string.
 * Returns undefined if string is missing or not a number.
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
 * Load values from process.env.
 * Returns only explicitly present env fields — rest remain undefined
 * so as not to override Zod defaults.
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
// Public API
// ---------------------------------------------------------------------------

let cachedConfig: Config | null = null;

/**
 * Load and validate configuration.
 *
 * @param cliOverrides — values from CLI (highest priority)
 */
export function loadConfig(cliOverrides?: Partial<Config>): Config {
  const merged = {
    ...loadFromEnv(),
    ...(cliOverrides ?? {}),
  };

  try {
    // ConfigSchema.parse applies Zod defaults for missing fields
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



// Re-export types so consumers don't import directly from schema
export { ConfigSchema, type Config, DEFAULT_VALUES } from './schema';