// solana/constants.ts
/**
 * Solana та Raydium константи
 * Містить program IDs, seed prefixes та інші незмінні значення
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Raydium CPMM Program IDs (Mainnet)
 * Джерело: Raydium документація [citation:1][citation:9]
 */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
);

/**
 * Raydium CPMM Config Account (Mainnet)
 * Містить конфігурацію комісій для всіх пулів
 */
export const RAYDIUM_CPMM_CONFIG_ID = new PublicKey(
  'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2'
);

/**
 * Fee Receiver Account (Mainnet)
 */
export const RAYDIUM_FEE_RECEIVER = new PublicKey(
  'DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8'
);

/**
 * Розмір акаунту пулу CPMM в байтах
 * Засновано на структурі PoolState [citation:4][citation:6]
 */
export const CPMM_POOL_ACCOUNT_SIZE = 752; // 752 bytes для zero-copy account

/**
 * Seeds для PDA деривації [citation:4][citation:6]
 */
export const POOL_SEED = 'pool';
export const POOL_LP_MINT_SEED = 'pool_lp_mint';
export const POOL_VAULT_SEED = 'pool_vault';
export const OBSERVATION_SEED = 'observation';

/**
 * Стандартна комісія Raydium CPMM (0.25% в basis points)
 */
export const DEFAULT_FEE_BPS = 25; // 0.25%

/**
 * Максимальна кількість акаунтів для одного RPC виклику
 * Solana JSON RPC ліміт: 200 акаунтів за замовчуванням
 */
export const MAX_ACCOUNTS_PER_RPC_CALL = 100;

/**
 * Кількість спроб при помилках RPC
 */
export const RPC_RETRY_ATTEMPTS = 3;

/**
 * Затримка між спробами (мс) - з експоненційним ростом
 */
export const RPC_RETRY_DELAY_MS = 1000;

/**
 * Офсети полів в акаунті пулу (в байтах) [citation:4]
 * Засновано на структурі PoolState в Raydium CPMM
 */
export const POOL_FIELD_OFFSETS = {
  // Дискримінатор (8 байт)
  DISCRIMINATOR: 0,
  
  // Адреси токенів (32 байти кожна, після дискримінатора)
  TOKEN_0_MINT: 8,      // зміщення до token_0_mint
  TOKEN_1_MINT: 40,     // token_1_mint через 32 байти після token_0_mint
  
  // Vault адреси
  TOKEN_0_VAULT: 72,
  TOKEN_1_VAULT: 104,
  
  // LP Mint
  LP_MINT: 136,
  
  // Статус пулу (u8)
  STATUS: 200,
  
  // Децимали
  MINT_0_DECIMALS: 202,
  MINT_1_DECIMALS: 203,
  
  // Резерви (u64) - після комісій та інших полів
  // Точні офсети потребують перевірки через on-chain структуру
  RESERVE_0: 240,      // Приблизний офсет
  RESERVE_1: 248,      // Приблизний офсет
} as const;

/**
 * Розміри полів в байтах
 */
export const FIELD_SIZES = {
  DISCRIMINATOR: 8,
  PUBLIC_KEY: 32,
  U64: 8,
  U8: 1,
} as const;