// solana/parsers.ts
/**
 * Парсери для Solana акаунтів Raydium CPMM пулів
 * Конвертує сирі буфери в структуровані дані
 */

import { PublicKey, AccountInfo } from '@solana/web3.js';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  POOL_FIELD_OFFSETS,
  DEFAULT_FEE_BPS,
  RAYDIUM_CPMM_PROGRAM_ID,
} from './constants';

/**
 * Результат парсингу акаунту пулу
 */
export type ParsedPoolAccount = {
  address: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  lpMint: PublicKey;
  status: number;
  mint0Decimals: number;
  mint1Decimals: number;
  reserve0: bigint;
  reserve1: bigint;
  protocolFees0: bigint;
  protocolFees1: bigint;
};

/**
 * Читання bigint з буферу (little-endian)
 */
function readU64(buffer: Buffer, offset: number): bigint {
  // Buffer.readBigUInt64LE доступний з Node.js v10.20.0
  if (typeof buffer.readBigUInt64LE === 'function') {
    return buffer.readBigUInt64LE(offset);
  }
  
  // Fallback для старих версій
  const low = buffer.readUInt32LE(offset);
  const high = buffer.readUInt32LE(offset + 4);
  return (BigInt(high) << 32n) | BigInt(low);
}

/**
 * Парсинг акаунту пулу в RawPool
 * 
 * Структура акаунту заснована на PoolState з Raydium CPMM програми [citation:4][citation:6]
 * 
 * @param address - Адреса акаунту пулу
 * @param accountInfo - Інформація акаунту з блокчейну
 * @param expectedMintA - Очікуваний mint A (для верифікації)
 * @param expectedMintB - Очікуваний mint B (для верифікації)
 * @returns RawPool об'єкт або null при помилці
 */
export function parsePoolAccount(
  address: PublicKey,
  accountInfo: AccountInfo<Buffer>,
  expectedMintA?: string,
  expectedMintB?: string
): RawPool | null {
  const data = accountInfo.data;
  
  // Перевірка мінімального розміру даних
  if (data.length < 256) {
    logger.warn('Pool account data too small', {
      address: address.toString(),
      size: data.length,
      expected: 256,
    });
    return null;
  }
  
  try {
    // Читання адрес токенів з буферу
    const token0Mint = new PublicKey(data.slice(
      POOL_FIELD_OFFSETS.TOKEN_0_MINT,
      POOL_FIELD_OFFSETS.TOKEN_0_MINT + 32
    ));
    const token1Mint = new PublicKey(data.slice(
      POOL_FIELD_OFFSETS.TOKEN_1_MINT,
      POOL_FIELD_OFFSETS.TOKEN_1_MINT + 32
    ));
    
    // Верифікація що пул відповідає очікуваним токенам
    if (expectedMintA && expectedMintB) {
      const token0Str = token0Mint.toString();
      const token1Str = token1Mint.toString();
      const [expA, expB] = [expectedMintA, expectedMintB].sort();
      const [tok0, tok1] = [token0Str, token1Str].sort();
      
      if (tok0 !== expA || tok1 !== expB) {
        logger.debug('Pool does not match expected tokens', {
          address: address.toString(),
          expected: `${expA},${expB}`,
          actual: `${tok0},${tok1}`,
        });
        return null;
      }
    }
    
    // Читання Vault адрес
    const token0Vault = new PublicKey(data.slice(
      POOL_FIELD_OFFSETS.TOKEN_0_VAULT,
      POOL_FIELD_OFFSETS.TOKEN_0_VAULT + 32
    ));
    const token1Vault = new PublicKey(data.slice(
      POOL_FIELD_OFFSETS.TOKEN_1_VAULT,
      POOL_FIELD_OFFSETS.TOKEN_1_VAULT + 32
    ));
    
    // LP Mint
    const lpMint = new PublicKey(data.slice(
      POOL_FIELD_OFFSETS.LP_MINT,
      POOL_FIELD_OFFSETS.LP_MINT + 32
    ));
    
    // Статус пулу та децимали
    const status = data.readUInt8(POOL_FIELD_OFFSETS.STATUS);
    const mint0Decimals = data.readUInt8(POOL_FIELD_OFFSETS.MINT_0_DECIMALS);
    const mint1Decimals = data.readUInt8(POOL_FIELD_OFFSETS.MINT_1_DECIMALS);
    
    // Читання резервів (приблизні офсети)
    // В реальній імплементації потрібно уточнити точні офсети
    const reserve0 = readU64(data, POOL_FIELD_OFFSETS.RESERVE_0);
    const reserve1 = readU64(data, POOL_FIELD_OFFSETS.RESERVE_1);
    
    // Читання накопичених комісій
    const protocolFees0 = readU64(data, POOL_FIELD_OFFSETS.RESERVE_0 + 16);
    const protocolFees1 = readU64(data, POOL_FIELD_OFFSETS.RESERVE_1 + 16);
    
    // Розрахунок доступних резервів (загальні резерви мінус комісії) [citation:2]
    const availableReserve0 = reserve0 - protocolFees0;
    const availableReserve1 = reserve1 - protocolFees1;
    
    // Створення RawPool об'єкту
    const pool: RawPool = {
      address: address.toString(),
      tokenA: token0Mint.toString(),
      tokenB: token1Mint.toString(),
      reserveA: availableReserve0,
      reserveB: availableReserve1,
      decimalsA: mint0Decimals,
      decimalsB: mint1Decimals,
      feeBps: DEFAULT_FEE_BPS,
    };
    
    logger.debug('Successfully parsed pool account', {
      address: address.toString(),
      tokenA: pool.tokenA.slice(0, 8),
      tokenB: pool.tokenB.slice(0, 8),
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      status,
      isActive: (status & 4) === 0,
    });
    
    return pool;
  } catch (error) {
    logger.error('Failed to parse pool account', {
      address: address.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Пакетний парсинг множинних акаунтів
 */
export function parseMultiplePoolAccounts(
  accounts: Map<string, AccountInfo<Buffer> | null>,
  expectedMintA: string,
  expectedMintB: string
): RawPool[] {
  const pools: RawPool[] = [];
  
  for (const [address, accountInfo] of accounts) {
    if (!accountInfo) continue;
    
    try {
      const pool = parsePoolAccount(
        new PublicKey(address),
        accountInfo,
        expectedMintA,
        expectedMintB
      );
      if (pool) {
        pools.push(pool);
      }
    } catch (error) {
      logger.debug('Failed to parse pool in batch', { address, error });
    }
  }
  
  return pools;
}

/**
 * Перевірка чи акаунт є валідним CPMM пулом
 */
export function isValidCpmmPool(accountInfo: AccountInfo<Buffer>): boolean {
  const data = accountInfo.data;
  
  // Перевірка мінімального розміру
  if (data.length < 200) return false;
  
  // Перевірка програми-власника
  if (!accountInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID)) return false;
  
  // Перевірка що акаунт виконуваний? (для програм)
  if (accountInfo.executable) return false;
  
  return true;
}

// Експорт публічного API
export default {
  parsePoolAccount,
  parseMultiplePoolAccounts,
  isValidCpmmPool,
  readU64,
};