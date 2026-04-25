// solana/constants.ts
/**
 * Solana and Raydium CPMM constants.
 * Account offsets are no longer needed — using Raydium SDK v2
 * which provides typed layout decoders.
 */

import { PublicKey } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

/**
 * Raydium CPMM Program ID (Mainnet)
 * Source: https://docs.raydium.io/raydium/traders/trade-api
 */
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
);

// ---------------------------------------------------------------------------
// Seeds for PDA Derivation
// ---------------------------------------------------------------------------

/**
 * Seeds verified against:
 * raydium-io/raydium-cp-swap/programs/cp-swap/src/states/pool.rs
 */
export const POOL_SEED = 'pool';
export const POOL_LP_MINT_SEED = 'pool_lp_mint';
export const POOL_VAULT_SEED = 'pool_vault';
export const OBSERVATION_SEED = 'observation';
export const AMM_CONFIG_SEED = 'amm_config';

// ---------------------------------------------------------------------------
// Account Sizes (for dataSize filter in getProgramAccounts)
// ---------------------------------------------------------------------------

export const CPMM_POOL_ACCOUNT_SIZE = 637; // CpmmPoolInfoLayout.span — verified against SDK v0.2.41-alpha

// ---------------------------------------------------------------------------
// Pool Status
// ---------------------------------------------------------------------------

/**
 * Pool status bitmask.
 * If a bit is set, the corresponding operation is disabled.
 * Source: PoolStatusBitIndex in Raydium CPMM
 */
export const POOL_STATUS_BITS = {
  DEPOSIT_DISABLED: 1, // 0b001
  WITHDRAW_DISABLED: 2, // 0b010
  SWAP_DISABLED: 4, // 0b100
} as const;

// ---------------------------------------------------------------------------
// Fallback fee
// ---------------------------------------------------------------------------

/**
 * Standard Raydium CPMM fee is 0.25%.
 * Used as a fallback if the SDK does not return a fee.
 */
export const DEFAULT_FEE_BPS = 25;

// ---------------------------------------------------------------------------
// RPC Limits
// ---------------------------------------------------------------------------

export const MAX_ACCOUNTS_PER_RPC_CALL = 100;
export const RPC_RETRY_ATTEMPTS = 3;
export const RPC_RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// SPL Token
// ---------------------------------------------------------------------------

/** Balance offset in SPL Token account (for direct reading if necessary) */
export const SPL_TOKEN_AMOUNT_OFFSET = 64;

// ---------------------------------------------------------------------------
// Known Mint Addresses
// ---------------------------------------------------------------------------

export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
} as const;