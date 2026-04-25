// solana/parsers.ts
/**
 * Parsers for Raydium CPMM accounts via Raydium SDK v2.
 *
 * SDK provides typed layout decoders — no need to manually read offsets.
 * CpmmPoolInfoLayout.decode() returns a fully typed object
 * with all fields including vault addresses and fee rate.
 */

import { PublicKey, AccountInfo, Connection } from '@solana/web3.js';
import { CpmmPoolInfoLayout, CpmmConfigInfoLayout } from '@raydium-io/raydium-sdk-v2';
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
// Types
// ---------------------------------------------------------------------------

/**
 * Decoded pool state from SDK layout.
 * Contains all fields including vault addresses.
 */
export type DecodedPoolState = ReturnType<typeof CpmmPoolInfoLayout.decode>;

// ---------------------------------------------------------------------------
// Parsing PoolState via SDK
// ---------------------------------------------------------------------------

/**
 * Decode pool account via Raydium SDK layout.
 * Returns a typed object or null on error.
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
    // SDK decodes all fields including:
    // - mintA, mintB
    // - vaultA, vaultB
    // - mintDecimalA, mintDecimalB
    // - status
    // - configId (for fee rate)
    const decoded = CpmmPoolInfoLayout.decode(accountInfo.data);

    logger.debug('Decoded pool state', {
      address: address.toString().slice(0, 8),
      token0: decoded.mintA.toString().slice(0, 8),
      token1: decoded.mintB.toString().slice(0, 8),
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
// Check pool activity
// ---------------------------------------------------------------------------

export function isSwapEnabled(decoded: DecodedPoolState): boolean {
  return (decoded.status & POOL_STATUS_BITS.SWAP_DISABLED) === 0;
}

// ---------------------------------------------------------------------------
// Read vault balance (SPL Token account)
// ---------------------------------------------------------------------------

/**
 * Read balance of SPL Token vault account.
 * SPL Token amount is located at offset 64 (after mint + owner).
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
// Assemble RawPool
// ---------------------------------------------------------------------------

/**
 * Assemble RawPool from decoded PoolState + vault balances.
 *
 * @param address      - pool address
 * @param decoded      - decoded PoolState (via SDK)
 * @param reserve0     - vaultA balance
 * @param reserve1     - vaultB balance
 * @param feeBps       - fee in basis points (from AmmConfig or default)
 * @param expectedMintA - pair filter
 * @param expectedMintB - pair filter
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
  const token0Str = decoded.mintA.toString();
  const token1Str = decoded.mintB.toString();

  // Token pair verification
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
    decimalsA: decoded.mintDecimalA,
    decimalsB: decoded.mintDecimalB,
    feeBps,
  };
}

// ---------------------------------------------------------------------------
// Parsing AmmConfig fee via SDK
// ---------------------------------------------------------------------------

/**
 * Read trade fee rate from AmmConfig account.
 * SDK stores tradeFeeRate as BN in units of 1e-6.
 * 2500 -> 0.25% -> 25 bps
 */
export function parseAmmConfigFee(accountInfo: AccountInfo<Buffer>): number {
  try {
    const decoded = CpmmConfigInfoLayout.decode(accountInfo.data);
    const feeRateRaw = BigInt(decoded.tradeFeeRate.toString());
    
    // feeRate units: 1e-6 (e.g. 2500 -> 0.0025)
    // convert to bps (1e-4): bps = feeRate / 100
    const feeBps = Number(feeRateRaw / 100n);
    return feeBps > 0 ? feeBps : DEFAULT_FEE_BPS;
  } catch (error) {
    logger.debug('Failed to parse AmmConfig fee via SDK, using default', {
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_FEE_BPS;
  }
}
