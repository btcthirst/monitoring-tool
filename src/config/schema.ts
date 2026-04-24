// config/schema.ts
/**
 * Zod схеми для валідації конфігурації
 */

import { z } from 'zod';

/**
 * Валідатор Solana адреси (base58, 32–44 символи)
 */
const solanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address (must be base58, 32–44 chars)');

/**
 * Схема валідації конфігурації
 */
export const ConfigSchema = z.object({
  // Solana RPC
  rpcUrl: z.string().url('Invalid RPC URL').default('https://api.mainnet-beta.solana.com'),

  // Токени
  mintA: solanaAddress,
  mintB: solanaAddress,
  quoteMint: solanaAddress,

  // Арбітраж
  pollingIntervalMs: z.number().int().min(500, 'Polling interval must be >= 500ms').default(2000),
  minProfitThreshold: z.number().nonnegative('Min profit must be >= 0').default(0.01),
  tradeSize: z.number().positive('Trade size must be > 0').default(100),
  maxSlippagePercent: z
    .number()
    .positive()
    .max(1, 'Max slippage must be between 0 and 1 (e.g. 0.05 = 5%)')
    .default(0.05),
  txCostInQuote: z.number().nonnegative().default(0.0002),

  // Логування
  logLevel: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  logToFile: z.boolean().default(true),

  // UI
  maxOpportunitiesDisplay: z.number().int().positive().default(15),
  showSlippage: z.boolean().default(true),

  // Просунуті опції
  maxPoolsToMonitor: z.number().int().positive().default(50),
  rpcRetries: z.number().int().min(1).max(10).default(3),
  rpcRetryDelayMs: z.number().int().positive().default(1000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Дефолтні адреси токенів (для довідки та .env.example)
 */
export const DEFAULT_VALUES = {
  mintA: 'So11111111111111111111111111111111111111112',   // Wrapped SOL
  mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
} as const;