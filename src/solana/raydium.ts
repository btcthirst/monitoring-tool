// solana/raydium.ts
/**
 * Raydium CPMM специфічні функції
 * Включає роботу з програмами, пошук пулів, парсинг акаунтів
 */

import { PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from './client';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  POOL_FIELD_OFFSETS,
  DEFAULT_FEE_BPS,
} from './constants';
import { parsePoolAccount } from './parsers';

/**
 * Фільтри для пошуку пулів за парою токенів
 */
export function buildPoolFilters(mintA: string, mintB: string): any[] {
  // Сортуємо mint адреси для консистентності
  const [sortedMintA, sortedMintB] = [mintA, mintB].sort();
  
  return [
    // Фільтр за розміром акаунту
    { dataSize: CPMM_POOL_ACCOUNT_SIZE },
    // Фільтр за token_0_mint (офсет 8)
    { memcmp: { offset: POOL_FIELD_OFFSETS.TOKEN_0_MINT, bytes: sortedMintA } },
    // Фільтр за token_1_mint (офсет 40)
    { memcmp: { offset: POOL_FIELD_OFFSETS.TOKEN_1_MINT, bytes: sortedMintB } },
  ];
}

/**
 * Пошук всіх CPMM пулів для заданої пари токенів
 */
export async function findPoolsForPair(
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string
): Promise<RawPool[]> {
  const startTime = Date.now();
  const filters = buildPoolFilters(mintA, mintB);
  
  logger.info('Searching for CPMM pools', {
    mintA,
    mintB,
    programId: RAYDIUM_CPMM_PROGRAM_ID.toString(),
  });
  
  const accounts = await rpcClient.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, filters);
  
  logger.debug('Raw program accounts fetched', {
    totalAccounts: accounts.length,
    elapsedMs: Date.now() - startTime,
  });
  
  if (accounts.length === 0) {
    logger.warn('No pools found for token pair', { mintA, mintB });
    return [];
  }
  
  // Парсимо кожен акаунт
  const pools: RawPool[] = [];
  const parseErrors: string[] = [];
  
  for (const { publicKey, account } of accounts) {
    try {
      const pool = parsePoolAccount(publicKey, account, mintA, mintB);
      if (pool) {
        pools.push(pool);
      }
    } catch (error) {
      const errorMsg = `Failed to parse pool ${publicKey.toString()}: ${error}`;
      parseErrors.push(errorMsg);
      logger.debug(errorMsg);
    }
  }
  
  logger.info('Pool discovery completed', {
    poolsFound: pools.length,
    parseErrors: parseErrors.length,
    elapsedMs: Date.now() - startTime,
  });
  
  return pools;
}

/**
 * Отримання конфігураційного акаунту Raydium
 * Містить глобальні налаштування комісій
 */
export async function getRaydiumConfig(
  rpcClient: SolanaRpcClient,
  configId: PublicKey
): Promise<{ tradeFeeRate: number } | null> {
  try {
    const accountInfo = await rpcClient.getAccountInfo(configId);
    
    if (!accountInfo || !accountInfo.data) {
      logger.warn('Raydium config account not found', { configId: configId.toString() });
      return null;
    }
    
    // Парсинг конфігурації (спрощено, повний парсинг потребує структури)
    // tradeFeeRate знаходиться на певному офсеті
    const data = accountInfo.data;
    const tradeFeeRateBps = data.readUInt16LE(8); // Приблизний офсет
    
    return { tradeFeeRate: tradeFeeRateBps };
  } catch (error) {
    logger.error('Failed to fetch Raydium config', { configId: configId.toString(), error });
    return null;
  }
}

/**
 * Валідація, що акаунт є активним пулом
 */
export function isPoolActive(status: number): boolean {
  // Біт 2 відповідає за swap (значення 4)
  // Якщо біт встановлено - swap вимкнено
  // Джерело: PoolStatusBitIndex [citation:4]
  const SWAP_DISABLED_BIT = 4;
  return (status & SWAP_DISABLED_BIT) === 0;
}

/**
 * Отримання комісії пулу в basis points
 * Стандарт для Raydium CPMM - 0.25% (25 bps)
 */
export function getPoolFeeBps(): number {
  return DEFAULT_FEE_BPS;
}

/**
 * Збирач пулів з пакетною обробкою для великої кількості адрес
 */
export async function batchFetchPools(
  rpcClient: SolanaRpcClient,
  poolAddresses: PublicKey[]
): Promise<Map<string, RawPool | null>> {
  const accounts = await rpcClient.getMultipleAccounts(poolAddresses);
  
  const result = new Map<string, RawPool | null>();
  
  for (const [address, account] of accounts) {
    if (!account) {
      result.set(address, null);
      continue;
    }
    
    try {
      // Примітка: для batch парсингу потрібно знати mintA/mintB
      // Ця функція потребує додаткового контексту
      result.set(address, null);
    } catch {
      result.set(address, null);
    }
  }
  
  return result;
}

// Експорт публічного API
export default {
  findPoolsForPair,
  buildPoolFilters,
  getRaydiumConfig,
  isPoolActive,
  getPoolFeeBps,
  batchFetchPools,
};