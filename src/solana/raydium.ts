// solana/raydium.ts
/**
 * Raydium CPMM специфічна логіка.
 *
 * Цей модуль містить ТІЛЬКИ:
 * - PDA деривацію (pool address, vault addresses)
 * - Хелпери для роботи з Raydium структурами
 *
 * Пошук пулів — у poolDiscovery.ts
 * Парсинг акаунтів — у parsers.ts
 * Константи — у constants.ts
 */

import { PublicKey } from '@solana/web3.js';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  POOL_SEED,
  POOL_LP_MINT_SEED,
  POOL_VAULT_SEED,
  POOL_STATUS_BITS,
} from './constants';

// ---------------------------------------------------------------------------
// PDA деривація
// ---------------------------------------------------------------------------

/**
 * Деривація адреси пулу (Pool PDA).
 *
 * Seeds: ["pool", amm_config, token_0_mint, token_1_mint]
 * Токени повинні бути відсортовані (token_0 < token_1).
 */
export async function derivePoolAddress(
  ammConfig: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
): Promise<[PublicKey, number]> {
  const [sorted0, sorted1] = sortMints(token0Mint, token1Mint);

  return PublicKey.findProgramAddress(
    [
      Buffer.from(POOL_SEED),
      ammConfig.toBuffer(),
      sorted0.toBuffer(),
      sorted1.toBuffer(),
    ],
    RAYDIUM_CPMM_PROGRAM_ID,
  );
}

/**
 * Деривація адреси vault акаунту для токена.
 *
 * Seeds: ["pool_vault", pool_id, token_mint]
 */
export async function deriveVaultAddress(
  poolId: PublicKey,
  tokenMint: PublicKey,
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [
      Buffer.from(POOL_VAULT_SEED),
      poolId.toBuffer(),
      tokenMint.toBuffer(),
    ],
    RAYDIUM_CPMM_PROGRAM_ID,
  );
}

/**
 * Деривація адреси LP mint.
 *
 * Seeds: ["pool_lp_mint", pool_id]
 */
export async function deriveLpMintAddress(
  poolId: PublicKey,
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from(POOL_LP_MINT_SEED), poolId.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Хелпери
// ---------------------------------------------------------------------------

/**
 * Сортування двох mint адрес (Raydium зберігає token_0 < token_1).
 */
export function sortMints(
  mintA: PublicKey,
  mintB: PublicKey,
): [PublicKey, PublicKey] {
  const [a, b] = [mintA.toString(), mintB.toString()].sort();
  return a === mintA.toString() ? [mintA, mintB] : [mintB, mintA];
}

/**
 * Перевірка статусу пулу за бітовою маскою.
 */
export function isSwapEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.SWAP_DISABLED) === 0;
}

export function isDepositEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.DEPOSIT_DISABLED) === 0;
}

export function isWithdrawEnabled(status: number): boolean {
  return (status & POOL_STATUS_BITS.WITHDRAW_DISABLED) === 0;
}