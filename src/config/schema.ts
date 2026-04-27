// config/schema.ts
/**
 * Zod schemas for configuration validation
 */

import { z } from 'zod';

/**
 * Solana address validator (base58, 32-44 chars)
 */
const solanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address (must be base58, 32-44 chars)');

/**
 * Configuration validation schema
 */
export const ConfigSchema = z.object({
  // Solana RPC
  rpcUrl: z.string().url('Invalid RPC URL').default('https://api.mainnet-beta.solana.com'),

  // Tokens
  mintA: solanaAddress,
  mintB: solanaAddress,
  quoteMint: solanaAddress.optional(),

  // Arbitrage
  pollingIntervalMs: z.number().int().min(500, 'Polling interval must be >= 500ms').default(2000),
  minProfitThreshold: z.number().nonnegative('Min profit must be >= 0').default(0.01),
  tradeSize: z.number().positive('Trade size must be > 0').default(100),
  maxSlippagePercent: z
    .number()
    .positive()
    .max(1, 'Max slippage must be between 0 and 1 (e.g. 0.05 = 5%)')
    .default(0.05),
  txCostInQuote: z.number().nonnegative().default(0.0002),

  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
}).transform((cfg) => ({
  ...cfg,
  quoteMint: cfg.quoteMint ?? cfg.mintB,
}));

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default token addresses (for reference and .env.example)
 */
export const DEFAULT_VALUES = {
  mintA: 'So11111111111111111111111111111111111111112',   // Wrapped SOL
  mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
} as const;