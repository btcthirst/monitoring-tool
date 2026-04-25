// solana/constants.ts
/**
 * Solana та Raydium CPMM константи.
 * Офсети акаунтів більше не потрібні — використовуємо Raydium SDK v2
 * який надає типізовані layout декодери.
 */

import { PublicKey } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

/**
 * Raydium CPMM Program ID (Mainnet)
 * Джерело: https://docs.raydium.io/raydium/traders/trade-api
 */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
);

// ---------------------------------------------------------------------------
// Seeds для PDA деривації
// ---------------------------------------------------------------------------

/**
 * Seeds верифіковано по:
 * raydium-io/raydium-cp-swap/programs/cp-swap/src/states/pool.rs
 */
export const POOL_SEED = 'pool';
export const POOL_LP_MINT_SEED = 'pool_lp_mint';
export const POOL_VAULT_SEED = 'pool_vault';
export const OBSERVATION_SEED = 'observation';
export const AMM_CONFIG_SEED = 'amm_config';

// ---------------------------------------------------------------------------
// Розміри акаунтів (для dataSize фільтра в getProgramAccounts)
// ---------------------------------------------------------------------------

export const CPMM_POOL_ACCOUNT_SIZE = 752;

// ---------------------------------------------------------------------------
// Статус пулу
// ---------------------------------------------------------------------------

/**
 * Бітова маска статусу пулу.
 * Якщо біт встановлено — відповідна операція вимкнена.
 * Джерело: PoolStatusBitIndex в Raydium CPMM
 */
export const POOL_STATUS_BITS = {
  DEPOSIT_DISABLED: 1, // 0b001
  WITHDRAW_DISABLED: 2, // 0b010
  SWAP_DISABLED: 4, // 0b100
} as const;

// ---------------------------------------------------------------------------
// Фолбек fee
// ---------------------------------------------------------------------------

/**
 * Стандартна комісія Raydium CPMM — 0.25%.
 * Використовується як фолбек якщо SDK не повернув fee.
 */
export const DEFAULT_FEE_BPS = 25;

// ---------------------------------------------------------------------------
// RPC ліміти
// ---------------------------------------------------------------------------

export const MAX_ACCOUNTS_PER_RPC_CALL = 100;
export const RPC_RETRY_ATTEMPTS = 3;
export const RPC_RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// SPL Token
// ---------------------------------------------------------------------------

/** Офсет балансу в SPL Token account (для прямого читання якщо треба) */
export const SPL_TOKEN_AMOUNT_OFFSET = 64;

// ---------------------------------------------------------------------------
// Відомі mint адреси
// ---------------------------------------------------------------------------

export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
} as const;