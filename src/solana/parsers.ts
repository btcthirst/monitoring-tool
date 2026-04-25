// solana/parsers.ts
/**
 * Парсери для Raydium CPMM акаунтів через Raydium SDK v2.
 *
 * SDK надає типізовані layout декодери — не треба вручну читати офсети.
 * CpmmPoolInfoLayout.decode() повертає повністю типізований об'єкт
 * з усіма полями включаючи vault адреси та fee rate.
 */

import { PublicKey, AccountInfo, Connection } from '@solana/web3.js';
import { CpmmPoolInfoLayout, ApiV3PoolInfoStandardItemCpmm } from '@raydium-io/raydium-sdk-v2';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  POOL_STATUS_BITS,
  DEFAULT_FEE_BPS,
  SPL_TOKEN_AMOUNT_OFFSET,
} from './constants';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

/**
 * Декодований стан пулу з SDK layout.
 * Містить всі поля включаючи vault адреси.
 */
export type DecodedPoolState = ReturnType<typeof CpmmPoolInfoLayout.decode>;

// ---------------------------------------------------------------------------
// Парсинг PoolState через SDK
// ---------------------------------------------------------------------------

/**
 * Декодування акаунту пулу через Raydium SDK layout.
 * Повертає типізований об'єкт або null при помилці.
 */
export function decodePoolState(
  address: PublicKey,
  accountInfo: AccountInfo<Buffer>,
): DecodedPoolState | null {
  if (!accountInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID)) {
    logger.debug('Not a Raydium CPMM account', {
      address: address.toString().slice(0, 8),
      owner: accountInfo.owner.toString().slice(0, 8),
    });
    return null;
  }

  if (accountInfo.data.length < CPMM_POOL_ACCOUNT_SIZE) {
    logger.warn('Pool account data too small', {
      address: address.toString().slice(0, 8),
      size: accountInfo.data.length,
    });
    return null;
  }

  try {
    // SDK декодує всі поля включаючи:
    // - token0Mint, token1Mint
    // - token0Vault, token1Vault
    // - mintDecimal0, mintDecimal1
    // - status
    // - ammConfig (для fee rate)
    const decoded = CpmmPoolInfoLayout.decode(accountInfo.data);

    logger.debug('Decoded pool state', {
      address: address.toString().slice(0, 8),
      token0: decoded.token0Mint.toString().slice(0, 8),
      token1: decoded.token1Mint.toString().slice(0, 8),
      status: decoded.status,
    });

    return decoded;
  } catch (error) {
    logger.error('Failed to decode pool state via SDK', {
      address: address.toString().slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Перевірка активності пулу
// ---------------------------------------------------------------------------

export function isSwapEnabled(decoded: DecodedPoolState): boolean {
  return (decoded.status & POOL_STATUS_BITS.SWAP_DISABLED) === 0;
}

// ---------------------------------------------------------------------------
// Читання балансу vault (SPL Token account)
// ---------------------------------------------------------------------------

/**
 * Читання балансу SPL Token vault акаунту.
 * SPL Token amount знаходиться на офсеті 64 (після mint + owner).
 */
export function readVaultBalance(accountInfo: AccountInfo<Buffer>): bigint | null {
  if (accountInfo.data.length < SPL_TOKEN_AMOUNT_OFFSET + 8) {
    return null;
  }
  try {
    return accountInfo.data.readBigUInt64LE(SPL_TOKEN_AMOUNT_OFFSET);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Збірка RawPool
// ---------------------------------------------------------------------------

/**
 * Збірка RawPool з декодованого PoolState + vault балансів.
 *
 * @param address      — адреса пулу
 * @param decoded      — декодований PoolState (через SDK)
 * @param reserve0     — баланс token0Vault
 * @param reserve1     — баланс token1Vault
 * @param feeBps       — fee в basis points (з AmmConfig або дефолт)
 * @param expectedMintA — фільтр пари
 * @param expectedMintB — фільтр пари
 */
export function buildRawPool(
  address: string,
  decoded: DecodedPoolState,
  reserve0: bigint,
  reserve1: bigint,
  feeBps: number,
  expectedMintA: string,
  expectedMintB: string,
): RawPool | null {
  const token0Str = decoded.token0Mint.toString();
  const token1Str = decoded.token1Mint.toString();

  // Верифікація пари токенів
  const sortedExpected = [expectedMintA, expectedMintB].sort();
  const sortedActual = [token0Str, token1Str].sort();

  const expA = sortedExpected[0] ?? '';
  const expB = sortedExpected[1] ?? '';
  const tok0 = sortedActual[0] ?? '';
  const tok1 = sortedActual[1] ?? '';

  if (tok0 !== expA || tok1 !== expB) {
    logger.debug('Pool token pair mismatch', {
      address: address.slice(0, 8),
      expected: `${expA.slice(0, 8)}/${expB.slice(0, 8)}`,
      actual: `${tok0.slice(0, 8)}/${tok1.slice(0, 8)}`,
    });
    return null;
  }

  if (reserve0 === 0n || reserve1 === 0n) {
    logger.debug('Pool has zero reserve, skipping', { address: address.slice(0, 8) });
    return null;
  }

  return {
    address,
    tokenA: token0Str,
    tokenB: token1Str,
    reserveA: reserve0,
    reserveB: reserve1,
    decimalsA: decoded.mintDecimal0,
    decimalsB: decoded.mintDecimal1,
    feeBps,
  };
}

// ---------------------------------------------------------------------------
// Парсинг AmmConfig fee через SDK
// ---------------------------------------------------------------------------

/**
 * Читання trade fee rate з AmmConfig акаунту.
 * SDK зберігає tradeFeeRate як BN в одиницях 1e-6.
 * 2500 → 0.25% → 25 bps
 */
export function parseAmmConfigFee(accountInfo: AccountInfo<Buffer>): number {
  try {
    // AmmConfig layout: discriminator(8) + bump(1) + ... + tradeFeeRate(u64 @ offset 12)
    if (accountInfo.data.length < 20) return DEFAULT_FEE_BPS;
    const feeRateRaw = accountInfo.data.readBigUInt64LE(12);
    // feeRate одиниці: 1e-6, конвертуємо в bps (1e-4)
    // bps = feeRate / 1_000_000 * 10_000 = feeRate / 100
    const feeBps = Number(feeRateRaw / 100n);
    return feeBps > 0 ? feeBps : DEFAULT_FEE_BPS;
  } catch {
    return DEFAULT_FEE_BPS;
  }
}

// ---------------------------------------------------------------------------
// Валідація
// ---------------------------------------------------------------------------

export function isValidCpmmPoolAccount(accountInfo: AccountInfo<Buffer>): boolean {
  return (
    !accountInfo.executable &&
    accountInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID) &&
    accountInfo.data.length === CPMM_POOL_ACCOUNT_SIZE
  );
}