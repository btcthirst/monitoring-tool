// solana/poolDiscovery.ts
/**
 * Пошук та завантаження Raydium CPMM пулів через SDK v2.
 *
 * Процес discovery (3 етапи):
 * 1. getProgramAccounts з dataSize + memcmp фільтрами → акаунти пулів
 * 2. SDK декодує PoolState → отримуємо vault адреси та ammConfig
 * 3. getMultipleAccounts для vaults → резерви; для ammConfigs → fee rates
 */

import { PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2';
import { SolanaRpcClient } from './client';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
} from './constants';
import {
  decodePoolState,
  isSwapEnabled,
  readVaultBalance,
  buildRawPool,
  parseAmmConfigFee,
} from './parsers';

// ---------------------------------------------------------------------------
// Константи
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

// Офсети для memcmp фільтрів — беремо з SDK layout
const TOKEN_0_MINT_OFFSET = CpmmPoolInfoLayout.offsetOf('token0Mint');
const TOKEN_1_MINT_OFFSET = CpmmPoolInfoLayout.offsetOf('token1Mint');

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
// Фільтри
// ---------------------------------------------------------------------------

/**
 * Побудова фільтрів для getProgramAccounts.
 * Офсети беруться з SDK layout — не хардкодимо вручну.
 */
export function buildPoolFilters(mintA: string, mintB: string): GetProgramAccountsFilter[] {
  const sorted = [mintA, mintB].sort();
  const sorted0 = sorted[0] ?? mintA;
  const sorted1 = sorted[1] ?? mintB;

  return [
    { dataSize: CPMM_POOL_ACCOUNT_SIZE },
    { memcmp: { offset: TOKEN_0_MINT_OFFSET, bytes: sorted0 } },
    { memcmp: { offset: TOKEN_1_MINT_OFFSET, bytes: sorted1 } },
  ];
}

// ---------------------------------------------------------------------------
// Головна функція discovery
// ---------------------------------------------------------------------------

/**
 * Знаходження всіх активних CPMM пулів для пари токенів.
 */
export async function findPoolsForPair(
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string,
  useCache = true,
): Promise<RawPool[]> {
  const cacheKey = [mintA, mintB].sort().join(':');

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

  logger.info('Discovering CPMM pools via SDK', { mintA, mintB });
  const startTime = Date.now();

  // ─── Етап 1: getProgramAccounts ───────────────────────────────────────────

  const filters = buildPoolFilters(mintA, mintB);
  const rawAccounts = await rpcClient.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, filters);

  if (rawAccounts.length === 0) {
    logger.warn('No CPMM pools found', { mintA, mintB });
    return [];
  }

  logger.debug('Raw accounts fetched', { count: rawAccounts.length });

  // ─── Етап 2: SDK декодування PoolState ────────────────────────────────────

  const decoded = rawAccounts
    .map(({ publicKey, account }) => {
      const state = decodePoolState(publicKey, account);
      if (!state) return null;
      if (!isSwapEnabled(state)) {
        logger.debug('Swap disabled, skipping pool', { address: publicKey.toString().slice(0, 8) });
        return null;
      }
      return { address: publicKey, state };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (decoded.length === 0) {
    logger.warn('All pool accounts failed to decode or swap is disabled');
    return [];
  }

  // ─── Етап 3: Vault баланси + AmmConfig fee ────────────────────────────────

  // Збираємо всі vault + ammConfig адреси одним batch запитом
  const vaultAndConfigAddresses = decoded.flatMap(({ state }) => [
    state.token0Vault,
    state.token1Vault,
    state.ammConfig,
  ]);

  const accountsMap = await rpcClient.getMultipleAccounts(vaultAndConfigAddresses);

  // ─── Збірка RawPool ───────────────────────────────────────────────────────

  const pools: RawPool[] = [];

  for (const { address, state } of decoded) {
    const vault0Info = accountsMap.get(state.token0Vault.toString());
    const vault1Info = accountsMap.get(state.token1Vault.toString());
    const configInfo = accountsMap.get(state.ammConfig.toString());

    if (!vault0Info || !vault1Info) {
      logger.debug('Vault account missing', { address: address.toString().slice(0, 8) });
      continue;
    }

    const reserve0 = readVaultBalance(vault0Info);
    const reserve1 = readVaultBalance(vault1Info);

    if (reserve0 === null || reserve1 === null) {
      logger.debug('Failed to read vault balance', { address: address.toString().slice(0, 8) });
      continue;
    }

    const feeBps = configInfo ? parseAmmConfigFee(configInfo) : 25;

    const pool = buildRawPool(
      address.toString(),
      state,
      reserve0,
      reserve1,
      feeBps,
      mintA,
      mintB,
    );

    if (pool) pools.push(pool);
  }

  // ─── Кешування ───────────────────────────────────────────────────────────

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
// Перевірка активності пулу
// ---------------------------------------------------------------------------

export async function isPoolActive(
  rpcClient: SolanaRpcClient,
  poolAddress: PublicKey,
): Promise<boolean> {
  const accountInfo = await rpcClient.getAccountInfo(poolAddress);
  if (!accountInfo) return false;

  const decoded = decodePoolState(poolAddress, accountInfo);
  if (!decoded) return false;

  return isSwapEnabled(decoded);
}