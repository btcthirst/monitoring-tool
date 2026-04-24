// solana/poolDiscovery.ts
/**
 * Пошук та завантаження Raydium CPMM пулів для заданої пари токенів.
 *
 * Процес discovery (3 етапи):
 *
 * 1. getProgramAccounts з memcmp фільтрами → список адрес пулів
 * 2. getMultipleAccounts для vault адрес кожного пулу → резерви
 * 3. getMultipleAccounts для amm_config адрес → реальні fee rates
 *
 * Кешування: результати discovery кешуються на CACHE_TTL_MS.
 * При refresh (updateCycle) кеш не використовується.
 */

import { PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { SolanaRpcClient } from './client';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  POOL_FIELD_OFFSETS,
} from './constants';
import { parsePoolState, parseAmmConfigFee, buildRawPool } from './parsers';

// ---------------------------------------------------------------------------
// Константи
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000; // 30 секунд

// ---------------------------------------------------------------------------
// Кеш
// ---------------------------------------------------------------------------

interface CacheEntry {
  pools: RawPool[];
  timestamp: number;
}

const poolCache = new Map<string, CacheEntry>();

export function clearPoolCache(): void {
  poolCache.clear();
  logger.debug('Pool cache cleared');
}

// ---------------------------------------------------------------------------
// Побудова фільтрів
// ---------------------------------------------------------------------------

/**
 * Побудова memcmp фільтрів для getProgramAccounts.
 *
 * Raydium CPMM зберігає токени відсортовано (token_0 < token_1 лексично),
 * тому сортуємо і ми перед побудовою фільтрів.
 */
export function buildPoolFilters(mintA: string, mintB: string): GetProgramAccountsFilter[] {
  const sorted = [mintA, mintB].sort();
  const sorted0 = sorted[0] ?? mintA;
  const sorted1 = sorted[1] ?? mintB;

  return [
    { dataSize: CPMM_POOL_ACCOUNT_SIZE },
    {
      memcmp: {
        offset: POOL_FIELD_OFFSETS.TOKEN_0_MINT,
        bytes: sorted0,
      },
    },
    {
      memcmp: {
        offset: POOL_FIELD_OFFSETS.TOKEN_1_MINT,
        bytes: sorted1,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Головна функція discovery
// ---------------------------------------------------------------------------

/**
 * Знаходження всіх активних CPMM пулів для пари токенів.
 *
 * @param rpcClient — RPC клієнт
 * @param mintA     — mint address першого токена
 * @param mintB     — mint address другого токена
 * @param useCache  — використовувати кеш (default: true)
 */
export async function findPoolsForPair(
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string,
  useCache = true,
): Promise<RawPool[]> {
  const cacheKey = [mintA, mintB].sort().join(':');

  // Перевірка кешу
  if (useCache) {
    const cached = poolCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug('Using cached pools', {
        count: cached.pools.length,
        ageMs: Date.now() - cached.timestamp,
      });
      return cached.pools;
    }
  }

  logger.info('Discovering CPMM pools', { mintA, mintB });
  const startTime = Date.now();

  // ─── Етап 1: пошук адрес пулів ───────────────────────────────────────────

  const filters = buildPoolFilters(mintA, mintB);
  const rawAccounts = await rpcClient.getProgramAccounts(
    RAYDIUM_CPMM_PROGRAM_ID,
    filters,
  );

  if (rawAccounts.length === 0) {
    logger.warn('No CPMM pools found for token pair', { mintA, mintB });
    return [];
  }

  logger.debug('Raw pool accounts fetched', { count: rawAccounts.length });

  // ─── Парсинг PoolState (без резервів) ────────────────────────────────────

  const poolStates = rawAccounts
    .map(({ publicKey, account }) => parsePoolState(publicKey, account))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s) => s.isSwapEnabled);

  if (poolStates.length === 0) {
    logger.warn('All pool accounts failed to parse or swap is disabled');
    return [];
  }

  logger.debug('Pool states parsed', {
    total: rawAccounts.length,
    valid: poolStates.length,
  });

  // ─── Етап 2: читання vault балансів ──────────────────────────────────────

  // Збираємо всі vault адреси (по 2 на пул)
  const vaultAddresses = poolStates.flatMap((s) => [s.token0Vault, s.token1Vault]);
  const vaultAccounts = await rpcClient.getMultipleAccounts(vaultAddresses);

  // ─── Етап 3: читання amm_config (fee rates) ──────────────────────────────

  // Унікальні amm_config адреси (кілька пулів можуть мати однакову конфігурацію)
  const uniqueConfigs = [...new Set(poolStates.map((s) => s.ammConfig.toString()))];
  const configAddresses = uniqueConfigs.map((a) => new PublicKey(a));
  const configAccounts = await rpcClient.getMultipleAccounts(configAddresses);

  // Будуємо мапу config → feeBps
  const feeByConfig = new Map<string, number>();
  for (const configAddr of uniqueConfigs) {
    const accountInfo = configAccounts.get(configAddr);
    const feeBps = accountInfo ? parseAmmConfigFee(accountInfo) : 25; // default 0.25%
    feeByConfig.set(configAddr, feeBps);
  }

  // ─── Збірка RawPool ───────────────────────────────────────────────────────

  const pools: RawPool[] = [];

  for (const poolState of poolStates) {
    const vault0Info = vaultAccounts.get(poolState.token0Vault.toString());
    const vault1Info = vaultAccounts.get(poolState.token1Vault.toString());

    if (!vault0Info?.data || !vault1Info?.data) {
      logger.debug('Vault account missing for pool', {
        address: poolState.address.slice(0, 8),
      });
      continue;
    }

    // Читаємо баланси vault акаунтів через client
    const reserve0 = await rpcClient.getTokenAccountBalance(poolState.token0Vault);
    const reserve1 = await rpcClient.getTokenAccountBalance(poolState.token1Vault);

    if (reserve0 === null || reserve1 === null) {
      logger.debug('Could not read vault balance', {
        address: poolState.address.slice(0, 8),
      });
      continue;
    }

    const feeBps = feeByConfig.get(poolState.ammConfig.toString()) ?? 25;

    const pool = buildRawPool(poolState, reserve0, reserve1, feeBps, mintA, mintB);
    if (pool) {
      pools.push(pool);
    }
  }

  // ─── Кешування та логування ───────────────────────────────────────────────

  if (useCache && pools.length > 0) {
    poolCache.set(cacheKey, { pools, timestamp: Date.now() });
  }

  logger.info('Pool discovery completed', {
    found: pools.length,
    elapsedMs: Date.now() - startTime,
    fees: pools.map((p) => `${p.feeBps}bps`),
  });

  return pools;
}

// ---------------------------------------------------------------------------
// Перевірка активності одного пулу
// ---------------------------------------------------------------------------

/**
 * Перевірка чи пул активний (swap не вимкнено).
 */
export async function isPoolActive(
  rpcClient: SolanaRpcClient,
  poolAddress: PublicKey,
): Promise<boolean> {
  const accountInfo = await rpcClient.getAccountInfo(poolAddress);
  if (!accountInfo?.data || accountInfo.data.length < POOL_FIELD_OFFSETS.STATUS + 1) {
    return false;
  }

  const status = accountInfo.data.readUInt8(POOL_FIELD_OFFSETS.STATUS);
  return (status & 4) === 0; // SWAP_DISABLED bit
}