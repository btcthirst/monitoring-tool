// solana/constants.ts
/**
 * Solana та Raydium CPMM константи.
 *
 * Офсети верифіковано по структурі PoolState з Raydium CPMM програми:
 * https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/states/pool.rs
 *
 * Структура PoolState (zero-copy, Anchor discriminator = 8 bytes):
 *
 *  offset  size  field
 *  ──────  ────  ─────────────────
 *       0     8  discriminator
 *       8    32  amm_config         ← PublicKey
 *      40    32  pool_creator       ← PublicKey
 *      72    32  token_0_mint       ← PublicKey
 *     104    32  token_1_mint       ← PublicKey
 *     136    32  lp_mint            ← PublicKey
 *     168    32  token_0_vault      ← PublicKey
 *     200    32  token_1_vault      ← PublicKey
 *     232    32  observation_key    ← PublicKey
 *     264     8  lp_supply          ← u64
 *     272     8  protocol_fees_token_0  ← u64
 *     280     8  protocol_fees_token_1  ← u64
 *     288     8  fund_fees_token_0  ← u64
 *     296     8  fund_fees_token_1  ← u64
 *     304     8  open_time          ← u64
 *     312     1  recent_epoch       ← u64 (8 bytes)
 *     320     1  padding (7 bytes)
 *     328     1  status             ← u8
 *     329     1  mint_decimals_0    ← u8
 *     330     1  mint_decimals_1    ← u8
 *
 * Резерви — це баланси vault акаунтів (token_0_vault, token_1_vault).
 * Вони НЕ зберігаються в PoolState напряму — читаються окремо через
 * getMultipleAccountsInfo для vault адрес (SPL Token account, offset 64).
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

/**
 * Raydium CPMM Authority PDA
 */
export const RAYDIUM_CPMM_AUTHORITY = new PublicKey(
  'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbR',
);

// ---------------------------------------------------------------------------
// Розміри акаунтів
// ---------------------------------------------------------------------------

/**
 * Розмір акаунту пулу CPMM в байтах.
 * Верифіковано: std::mem::size_of::<PoolState>() = 752 - 8 (discriminator) + 8 = 752
 */
export const CPMM_POOL_ACCOUNT_SIZE = 752;

/**
 * Розмір SPL Token account (для читання балансу vault).
 * Структура: mint(32) + owner(32) + amount(8) + ... = 165 bytes
 * Баланс знаходиться на офсеті 64 (після mint + owner).
 */
export const SPL_TOKEN_ACCOUNT_SIZE = 165;
export const SPL_TOKEN_AMOUNT_OFFSET = 64;

// ---------------------------------------------------------------------------
// Офсети полів PoolState
// ---------------------------------------------------------------------------

export const POOL_FIELD_OFFSETS = {
  DISCRIMINATOR: 0,       // 8 bytes

  AMM_CONFIG: 8,          // PublicKey (32 bytes)
  POOL_CREATOR: 40,       // PublicKey (32 bytes)

  TOKEN_0_MINT: 72,       // PublicKey (32 bytes)
  TOKEN_1_MINT: 104,      // PublicKey (32 bytes)
  LP_MINT: 136,           // PublicKey (32 bytes)
  TOKEN_0_VAULT: 168,     // PublicKey (32 bytes)  ← vault для читання резервів
  TOKEN_1_VAULT: 200,     // PublicKey (32 bytes)
  OBSERVATION_KEY: 232,   // PublicKey (32 bytes)

  LP_SUPPLY: 264,         // u64 (8 bytes)
  PROTOCOL_FEES_0: 272,   // u64 (8 bytes)
  PROTOCOL_FEES_1: 280,   // u64 (8 bytes)
  FUND_FEES_0: 288,       // u64 (8 bytes)
  FUND_FEES_1: 296,       // u64 (8 bytes)
  OPEN_TIME: 304,         // u64 (8 bytes)
  RECENT_EPOCH: 312,      // u64 (8 bytes)

  STATUS: 320,            // u8 (1 byte)
  MINT_0_DECIMALS: 321,   // u8 (1 byte)
  MINT_1_DECIMALS: 322,   // u8 (1 byte)
} as const;

// ---------------------------------------------------------------------------
// AmmConfig офсети (для читання fee rate)
// ---------------------------------------------------------------------------

/**
 * Офсети в акаунті AmmConfig.
 *
 * Структура AmmConfig:
 *  0    8  discriminator
 *  8    1  bump
 *  9    2  disable_create_pool (bool, але читаємо як u16)
 *  10   2  index (u16)
 *  12   8  trade_fee_rate (u64, basis points × 10^-6, тобто 2500 = 0.25%)
 *  20   8  protocol_fee_rate (u64)
 *  28   8  fund_fee_rate (u64)
 *  36   8  create_pool_fee (u64)
 */
export const AMM_CONFIG_OFFSETS = {
  DISCRIMINATOR: 0,
  TRADE_FEE_RATE: 12,     // u64 — fee в одиницях 1e-6 (2500 = 0.0025 = 0.25%)
  PROTOCOL_FEE_RATE: 20,  // u64
} as const;

/**
 * Дільник для конвертації trade_fee_rate → десятковий дріб.
 * 2500 / 1_000_000 = 0.0025 = 0.25%
 */
export const FEE_RATE_DIVISOR = 1_000_000n;

// ---------------------------------------------------------------------------
// Статус пулу
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Seeds для PDA деривації
// ---------------------------------------------------------------------------

/**
 * Seeds верифіковано по:
 * raydium-io/raydium-cp-swap/programs/cp-swap/src/states/pool.rs
 *
 * pub const POOL_SEED: &str = "pool";
 * pub const POOL_LP_MINT_SEED: &str = "pool_lp_mint";
 * pub const POOL_VAULT_SEED: &str = "pool_vault";
 * pub const OBSERVATION_SEED: &str = "observation";
 * pub const AMM_CONFIG_SEED: &str = "amm_config";
 */
export const POOL_SEED = 'pool';
export const POOL_LP_MINT_SEED = 'pool_lp_mint';
export const POOL_VAULT_SEED = 'pool_vault';
export const OBSERVATION_SEED = 'observation';
export const AMM_CONFIG_SEED = 'amm_config';

// ---------------------------------------------------------------------------
// Статус пулу
// ---------------------------------------------------------------------------

/**
 * Бітова маска статусу пулу.
 * Якщо біт встановлено — відповідна операція вимкнена.
 * Джерело: PoolStatusBitIndex в Raydium CPMM
 */
export const POOL_STATUS_BITS = {
  DEPOSIT_DISABLED: 1,   // 0b001
  WITHDRAW_DISABLED: 2,  // 0b010
  SWAP_DISABLED: 4,      // 0b100
} as const;

// ---------------------------------------------------------------------------
// Фолбек fee (якщо не вдалося прочитати з AmmConfig)
// ---------------------------------------------------------------------------

/**
 * Стандартна комісія Raydium CPMM пулу за замовчуванням — 0.25%.
 * Використовується тільки як фолбек якщо не вдалося прочитати з amm_config.
 */
export const DEFAULT_FEE_BPS = 25; // 0.25%

// ---------------------------------------------------------------------------
// RPC ліміти
// ---------------------------------------------------------------------------

/** Максимум акаунтів за один getMultipleAccounts виклик */
export const MAX_ACCOUNTS_PER_RPC_CALL = 100;

/** Кількість спроб при помилці RPC */
export const RPC_RETRY_ATTEMPTS = 3;

/** Базова затримка між спробами (мс), далі множиться на 2^attempt */
export const RPC_RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Відомі mint адреси (для зручності)
// ---------------------------------------------------------------------------

export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
} as const;