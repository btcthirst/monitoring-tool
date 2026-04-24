// solana/poolDiscovery.ts
/**
 * Пошук пулів Raydium CPMM в Solana блокчейні
 * 
 * Відповідальність:
 * - Пошук всіх CPMM пулів для заданої пари токенів
 * - Використання RPC клієнта для отримання акаунтів
 * - Парсинг акаунтів в RawPool об'єкти
 * - Кешування результатів пошуку
 * 
 * ВАЖЛИВО:
 * - Цей модуль залежить від RPC та Raydium
 * - НЕ містить бізнес-логіки арбітражу
 */

import { PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from './client';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  POOL_FIELD_OFFSETS,
} from './constants';
import { parsePoolAccount } from './parsers';

/**
 * Фільтри для пошуку пулів за парою токенів
 * 
 * @param mintA - адреса першого токена
 * @param mintB - адреса другого токена
 * @returns масив фільтрів для getProgramAccounts
 */
export function buildPoolFilters(mintA: string, mintB: string): any[] {
  // Сортуємо mint адреси для консистентності (щоб A завжди був меншим)
  const [sortedMintA, sortedMintB] = [mintA, mintB].sort();
  
  return [
    // Фільтр 1: розмір акаунту (усі CPMM пули мають однаковий розмір)
    { dataSize: CPMM_POOL_ACCOUNT_SIZE },
    
    // Фільтр 2: token_0_mint (офсет 8 байт від початку)
    { 
      memcmp: { 
        offset: POOL_FIELD_OFFSETS.TOKEN_0_MINT, 
        bytes: sortedMintA 
      } 
    },
    
    // Фільтр 3: token_1_mint (офсет 40 байт від початку)
    { 
      memcmp: { 
        offset: POOL_FIELD_OFFSETS.TOKEN_1_MINT, 
        bytes: sortedMintB 
      } 
    },
  ];
}

/**
 * Пошук всіх CPMM пулів для заданої пари токенів
 * 
 * @param rpcClient - RPC клієнт
 * @param mintA - адреса першого токена
 * @param mintB - адреса другого токена
 * @param options - опціональні налаштування
 * @returns масив RawPool об'єктів
 */
export async function findPoolsForPair(
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string,
  options?: {
    useCache?: boolean;
    cacheTtlMs?: number;
  }
): Promise<RawPool[]> {
  const startTime = Date.now();
  const cacheKey = `${mintA}:${mintB}`;
  const useCache = options?.useCache !== false;
  
  // Перевірка кешу (для зменшення навантаження на RPC)
  if (useCache && poolCache.has(cacheKey)) {
    const cached = poolCache.get(cacheKey)!;
    const isFresh = Date.now() - cached.timestamp < (options?.cacheTtlMs || CACHE_TTL_MS);
    
    if (isFresh) {
      logger.debug('Using cached pools', {
        mintA,
        mintB,
        count: cached.pools.length,
        ageMs: Date.now() - cached.timestamp,
      });
      return cached.pools;
    }
  }
  
  logger.info('Searching for CPMM pools', {
    mintA,
    mintB,
    programId: RAYDIUM_CPMM_PROGRAM_ID.toString(),
  });
  
  // Побудова фільтрів
  const filters = buildPoolFilters(mintA, mintB);
  
  logger.debug('Built pool filters', {
    filters: filters.map(f => 
      f.memcmp ? `memcmp: offset=${f.memcmp.offset}, bytes=${f.memcmp.bytes.slice(0, 8)}...` : `dataSize: ${f.dataSize}`
    ),
  });
  
  // RPC запит
  const accounts = await rpcClient.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, filters);
  
  logger.debug('Raw program accounts fetched', {
    totalAccounts: accounts.length,
    elapsedMs: Date.now() - startTime,
  });
  
  if (accounts.length === 0) {
    logger.warn('No pools found for token pair', { mintA, mintB });
    return [];
  }
  
  // Парсинг кожного акаунту
  const pools: RawPool[] = [];
  const parseErrors: Array<{ address: string; error: string }> = [];
  
  for (const { publicKey, account } of accounts) {
    try {
      const pool = parsePoolAccount(publicKey, account, mintA, mintB);
      if (pool) {
        pools.push(pool);
      }
    } catch (error) {
      parseErrors.push({
        address: publicKey.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      logger.debug('Failed to parse pool', {
        address: publicKey.toString(),
        error,
      });
    }
  }
  
  // Оновлення кешу
  if (useCache) {
    poolCache.set(cacheKey, {
      pools,
      timestamp: Date.now(),
    });
  }
  
  logger.info('Pool discovery completed', {
    poolsFound: pools.length,
    parseErrors: parseErrors.length,
    totalAccounts: accounts.length,
    elapsedMs: Date.now() - startTime,
  });
  
  // Логування помилок парсингу (для дебагу)
  if (parseErrors.length > 0 && pools.length === 0) {
    logger.warn('All pool accounts failed to parse', { errors: parseErrors.slice(0, 5) });
  }
  
  return pools;
}

// Кеш для результатів пошуку пулів
interface CacheEntry {
  pools: RawPool[];
  timestamp: number;
}

const poolCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30000; // 30 секунд

/**
 * Очищення кешу пулів
 */
export function clearPoolCache(): void {
  poolCache.clear();
  logger.debug('Pool cache cleared');
}

/**
 * Пошук пулів декількома RPC запитами (для великої кількості пар)
 */
export async function findPoolsForMultiplePairs(
  rpcClient: SolanaRpcClient,
  pairs: Array<{ mintA: string; mintB: string }>
): Promise<Map<string, RawPool[]>> {
  const results = new Map<string, RawPool[]>();
  
  // Виконуємо паралельно, але з обмеженням (щоб не перевантажити RPC)
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < pairs.length; i += batchSize) {
    batches.push(pairs.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async ({ mintA, mintB }) => {
        const key = `${mintA}:${mintB}`;
        const pools = await findPoolsForPair(rpcClient, mintA, mintB);
        return { key, pools };
      })
    );
    
    for (const { key, pools } of batchResults) {
      results.set(key, pools);
    }
  }
  
  return results;
}

/**
 * Отримання статусу пулу (активний/неактивний)
 */
export async function isPoolActive(
  rpcClient: SolanaRpcClient,
  poolAddress: PublicKey
): Promise<boolean> {
  const accountInfo = await rpcClient.getAccountInfo(poolAddress);
  
  if (!accountInfo || !accountInfo.data) {
    return false;
  }
  
  const data = accountInfo.data;
  if (data.length < POOL_FIELD_OFFSETS.STATUS + 1) {
    return false;
  }
  
  const status = data.readUInt8(POOL_FIELD_OFFSETS.STATUS);
  // Біт 2 (значення 4) вказує на вимкнення swap
  const SWAP_DISABLED_BIT = 4;
  
  return (status & SWAP_DISABLED_BIT) === 0;
}

// Експорт публічного API
export default {
  findPoolsForPair,
  findPoolsForMultiplePairs,
  buildPoolFilters,
  clearPoolCache,
  isPoolActive,
};