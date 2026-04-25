// solana/raydium.ts
/**
 * Raydium CPMM specific logic via SDK v2.
 *
 * SDK provides:
 * - getPdaPoolId() — pool address derivation
 * - getPdaPoolVaultId() — vault address derivation
 * - computeAmountIn/Out — swap simulation (used for verification)
 */

import { PublicKey } from '@solana/web3.js';
import {
  getPdaPoolId,
  getPdaPoolVaultId,
  getPdaLpMint,
  DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import { RAYDIUM_CPMM_PROGRAM_ID, POOL_STATUS_BITS } from './constants';

// ---------------------------------------------------------------------------
// PDA Derivation via SDK
// ---------------------------------------------------------------------------

/**
 * Derivation of the pool address.
 * SDK automatically sorts the tokens and builds the correct seeds.
 *
 * @returns { publicKey, nonce }
 */
export function derivePoolAddress(
  ammConfig: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
): { publicKey: PublicKey; nonce: number } {
  return getPdaPoolId(RAYDIUM_CPMM_PROGRAM_ID, ammConfig, token0Mint, token1Mint);
}

/**
 * Derivation of the vault address for a token in the pool.
 */
export function deriveVaultAddress(
  poolId: PublicKey,
  tokenMint: PublicKey,
): { publicKey: PublicKey; nonce: number } {
  return getPdaPoolVaultId(RAYDIUM_CPMM_PROGRAM_ID, poolId, tokenMint);
}

/**
 * Derivation of the LP mint address.
 */
export function deriveLpMintAddress(
  poolId: PublicKey,
): { publicKey: PublicKey; nonce: number } {
  return getPdaLpMint(RAYDIUM_CPMM_PROGRAM_ID, poolId);
}

// ---------------------------------------------------------------------------
// Status Helpers
// ---------------------------------------------------------------------------

export function isSwapEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.SWAP_DISABLED) === 0;
}

export function isDepositEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.DEPOSIT_DISABLED) === 0;
}

export function isWithdrawEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.WITHDRAW_DISABLED) === 0;
}

// ---------------------------------------------------------------------------
// Token Sorting (Raydium stores token0 < token1)
// ---------------------------------------------------------------------------

/**
 * Returns tokens in sorted order as Raydium expects.
 */
export function sortMints(
  mintA: PublicKey,
  mintB: PublicKey,
): [PublicKey, PublicKey] {
  const sorted = [mintA.toString(), mintB.toString()].sort();
  const isAFirst = sorted[0] === mintA.toString();
  return isAFirst ? [mintA, mintB] : [mintB, mintA];
}