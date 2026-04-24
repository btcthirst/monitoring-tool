// solana/parsers.ts
/**
 * Парсери для Raydium CPMM акаунтів.
 *
 * Важливо:
 * - Резерви пулу — це баланси vault акаунтів (SPL Token accounts),
 *   а НЕ поля в PoolState. Тому parsePoolAccount приймає vault баланси
 *   окремими параметрами.
 * - Fee читається з amm_config акаунту кожного пулу.
 * - Всі офсети верифіковано по constants.ts.
 */

import { PublicKey, AccountInfo } from '@solana/web3.js';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  POOL_FIELD_OFFSETS,
  AMM_CONFIG_OFFSETS,
  FEE_RATE_DIVISOR,
  POOL_STATUS_BITS,
  DEFAULT_FEE_BPS,
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
} from './constants';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

export type ParsedPoolState = {
  address: string;
  ammConfig: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  lpMint: PublicKey;
  mint0Decimals: number;
  mint1Decimals: number;
  status: number;
  isSwapEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Хелпери
// ---------------------------------------------------------------------------

function readU64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

function readPublicKey(buffer: Buffer, offset: number): PublicKey {
  return new PublicKey(buffer.slice(offset, offset + 32));
}

// ---------------------------------------------------------------------------
// Парсинг PoolState
// ---------------------------------------------------------------------------

export function parsePoolState(
  address: PublicKey,
  accountInfo: AccountInfo<Buffer>,
): ParsedPoolState | null {
  const data = accountInfo.data;

  if (!accountInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID)) {
    logger.debug('Account owner is not Raydium CPMM program', {
      address: address.toString().slice(0, 8),
      owner: accountInfo.owner.toString().slice(0, 8),
    });
    return null;
  }

  if (data.length < CPMM_POOL_ACCOUNT_SIZE) {
    logger.warn('Pool account data too small', {
      address: address.toString().slice(0, 8),
      size: data.length,
      expected: CPMM_POOL_ACCOUNT_SIZE,
    });
    return null;
  }

  try {
    const ammConfig = readPublicKey(data, POOL_FIELD_OFFSETS.AMM_CONFIG);
    const token0Mint = readPublicKey(data, POOL_FIELD_OFFSETS.TOKEN_0_MINT);
    const token1Mint = readPublicKey(data, POOL_FIELD_OFFSETS.TOKEN_1_MINT);
    const lpMint = readPublicKey(data, POOL_FIELD_OFFSETS.LP_MINT);
    const token0Vault = readPublicKey(data, POOL_FIELD_OFFSETS.TOKEN_0_VAULT);
    const token1Vault = readPublicKey(data, POOL_FIELD_OFFSETS.TOKEN_1_VAULT);

    const status = data.readUInt8(POOL_FIELD_OFFSETS.STATUS);
    const mint0Decimals = data.readUInt8(POOL_FIELD_OFFSETS.MINT_0_DECIMALS);
    const mint1Decimals = data.readUInt8(POOL_FIELD_OFFSETS.MINT_1_DECIMALS);
    const isSwapEnabled = (status & POOL_STATUS_BITS.SWAP_DISABLED) === 0;

    logger.debug('Parsed pool state', {
      address: address.toString().slice(0, 8),
      token0: token0Mint.toString().slice(0, 8),
      token1: token1Mint.toString().slice(0, 8),
      status,
      isSwapEnabled,
    });

    return {
      address: address.toString(),
      ammConfig,
      token0Mint,
      token1Mint,
      token0Vault,
      token1Vault,
      lpMint,
      mint0Decimals,
      mint1Decimals,
      status,
      isSwapEnabled,
    };
  } catch (error) {
    logger.error('Failed to parse pool state', {
      address: address.toString().slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Парсинг AmmConfig (fee rate)
// ---------------------------------------------------------------------------

export function parseAmmConfigFee(accountInfo: AccountInfo<Buffer>): number {
  const data = accountInfo.data;

  if (data.length < AMM_CONFIG_OFFSETS.TRADE_FEE_RATE + 8) {
    logger.warn('AmmConfig account too small, using default fee');
    return DEFAULT_FEE_BPS;
  }

  try {
    const feeRate = readU64LE(data, AMM_CONFIG_OFFSETS.TRADE_FEE_RATE);
    const feeBps = Number(feeRate / (FEE_RATE_DIVISOR / 10_000n));
    return feeBps > 0 ? feeBps : DEFAULT_FEE_BPS;
  } catch {
    logger.warn('Failed to parse AmmConfig fee, using default');
    return DEFAULT_FEE_BPS;
  }
}

// ---------------------------------------------------------------------------
// Збірка RawPool
// ---------------------------------------------------------------------------

export function buildRawPool(
  poolState: ParsedPoolState,
  reserve0: bigint,
  reserve1: bigint,
  feeBps: number,
  expectedMintA: string,
  expectedMintB: string,
): RawPool | null {
  const token0Str = poolState.token0Mint.toString();
  const token1Str = poolState.token1Mint.toString();

  // Використовуємо явні змінні замість destructuring щоб уникнути
  // 'possibly undefined' з noUncheckedIndexedAccess
  const sortedExpected = [expectedMintA, expectedMintB].sort();
  const sortedActual = [token0Str, token1Str].sort();

  const expA = sortedExpected[0] ?? '';
  const expB = sortedExpected[1] ?? '';
  const tok0 = sortedActual[0] ?? '';
  const tok1 = sortedActual[1] ?? '';

  if (tok0 !== expA || tok1 !== expB) {
    logger.debug('Pool does not match expected token pair', {
      address: poolState.address.slice(0, 8),
      expected: `${expA.slice(0, 8)}/${expB.slice(0, 8)}`,
      actual: `${tok0.slice(0, 8)}/${tok1.slice(0, 8)}`,
    });
    return null;
  }

  if (reserve0 === 0n || reserve1 === 0n) {
    logger.debug('Pool has zero reserve, skipping', {
      address: poolState.address.slice(0, 8),
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
    });
    return null;
  }

  return {
    address: poolState.address,
    tokenA: token0Str,
    tokenB: token1Str,
    reserveA: reserve0,
    reserveB: reserve1,
    decimalsA: poolState.mint0Decimals,
    decimalsB: poolState.mint1Decimals,
    feeBps,
  };
}

// ---------------------------------------------------------------------------
// Зворотна сумісність для orchestrator (refreshPoolData)
// ---------------------------------------------------------------------------

export function parsePoolAccount(
  address: PublicKey,
  accountInfo: AccountInfo<Buffer>,
  expectedMintA: string,
  expectedMintB: string,
  reserve0: bigint,
  reserve1: bigint,
  feeBps: number = DEFAULT_FEE_BPS,
): RawPool | null {
  const poolState = parsePoolState(address, accountInfo);
  if (!poolState) return null;

  if (!poolState.isSwapEnabled) {
    logger.debug('Swap disabled for pool', { address: address.toString().slice(0, 8) });
    return null;
  }

  return buildRawPool(poolState, reserve0, reserve1, feeBps, expectedMintA, expectedMintB);
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