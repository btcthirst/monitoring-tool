// config/schema.ts
/**
 * Zod схеми для валідації конфігурації
 */

import { z } from 'zod';

/**
 * Схема валідації конфігурації
 */
export const ConfigSchema = z.object({
  // Solana RPC
  rpcUrl: z.string().url().default('https://api.mainnet-beta.solana.com'),
  
  // Токени
  mintA: z.string().length(44, 'Invalid Solana address length'),
  mintB: z.string().length(44, 'Invalid Solana address length'),
  quoteMint: z.string().length(44, 'Invalid Solana address length'),
  
  // Арбітраж
  pollingIntervalMs: z.number().int().positive().default(2000),
  minProfitThreshold: z.number().positive().default(0.01),
  tradeSize: z.number().positive().default(100),
  maxSlippagePercent: z.number().positive().max(1).default(0.05),
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
 * Дефолтні значення (для довідки)
 */
export const DEFAULT_VALUES = {
  mintA: 'So11111111111111111111111111111111111111112', // SOL
  mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
} as const;