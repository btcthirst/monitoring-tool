// solana/raydium.ts
/**
 * Raydium CPMM специфічна логіка через SDK v2.
 *
 * SDK надає:
 * - getPdaPoolId() — деривація адреси пулу
 * - getPdaPoolVaultId() — деривація vault адрес
 * - computeAmountIn/Out — симуляція свапів (використовуємо для верифікації)
 */

import { PublicKey } from '@solana/web3.js';
import {
  getPdaPoolId,
  getPdaPoolVault,
  getPdaLpMint,
  DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import { RAYDIUM_CPMM_PROGRAM_ID, POOL_STATUS_BITS } from './constants';

// ---------------------------------------------------------------------------
// PDA деривація через SDK
// ---------------------------------------------------------------------------

/**
 * Деривація адреси пулу.
 * SDK сам сортує токени і будує правильні seeds.
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
 * Деривація адреси vault для токена в пулі.
 */
export function deriveVaultAddress(
  poolId: PublicKey,
  tokenMint: PublicKey,
): { publicKey: PublicKey; nonce: number } {
  return getPdaPoolVault(RAYDIUM_CPMM_PROGRAM_ID, poolId, tokenMint);
}

/**
 * Деривація адреси LP mint.
 */
export function deriveLpMintAddress(
  poolId: PublicKey,
): { publicKey: PublicKey; nonce: number } {
  return getPdaLpMint(RAYDIUM_CPMM_PROGRAM_ID, poolId);
}

// ---------------------------------------------------------------------------
// Хелпери статусу
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
// Сортування токенів (Raydium зберігає token0 < token1)
// ---------------------------------------------------------------------------

/**
 * Повертає токени у відсортованому порядку як Raydium очікує.
 */
export function sortMints(
  mintA: PublicKey,
  mintB: PublicKey,
): [PublicKey, PublicKey] {
  const sorted = [mintA.toString(), mintB.toString()].sort();
  const isAFirst = sorted[0] === mintA.toString();
  return isAFirst ? [mintA, mintB] : [mintB, mintA];
}