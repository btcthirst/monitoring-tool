// solana/poolDiscovery.ts
/**
 * Discovery and loading of Raydium CPMM pools via SDK v2.
 *
 * Discovery process (3 stages):
 * 1. getProgramAccounts with dataSize + memcmp filters -> pool accounts
 * 2. SDK decodes PoolState -> retrieve vault addresses and configId
 * 3. getMultipleAccounts for vaults -> reserves; for configIds -> fee rates
 *
 * Refresh process (stages 2-3 only, reuses known pool addresses):
 * - Skips stage 1 (no getProgramAccounts call)
 * - Decodes current on-chain state for each known pool address
 * - Re-fetches vault balances and config fees
 * - Falls back to full discovery if all pools have disappeared
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
  DecodedPoolState,
} from './parsers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;
const DEFAULT_FEE_BPS = 25;

// Offsets for memcmp filters — taken from SDK layout
const TOKEN_0_MINT_OFFSET = CpmmPoolInfoLayout.offsetOf('mintA');
const TOKEN_1_MINT_OFFSET = CpmmPoolInfoLayout.offsetOf('mintB');

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  pools: RawPool[];
  timestamp: number;
}

const poolCache = new Map<string, CacheEntry>();

/**
 * Remove all cache entries older than CACHE_TTL_MS.
 * Called on every write to prevent unbounded growth during long sessions.
 */
function evictExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of poolCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      poolCache.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sort two mint addresses the same way Raydium does on-chain:
 * by raw bytes of the PublicKey (not by base58 string).
 * This is critical — string sort != bytes sort for most pairs.
 */
function sortMintsByBytes(mintA: string, mintB: string): [string, string] {
  const bufA = new PublicKey(mintA).toBytes();
  const bufB = new PublicKey(mintB).toBytes();
  for (let i = 0; i < 32; i++) {
    if ((bufA[i] ?? 0) < (bufB[i] ?? 0)) return [mintA, mintB];
    if ((bufA[i] ?? 0) > (bufB[i] ?? 0)) return [mintB, mintA];
  }
  return [mintA, mintB];
}

/**
 * Fetch vault balances and fee configs for a set of decoded pool states,
 * then assemble RawPool objects. Shared by both discovery and refresh paths.
 */
async function assembleRawPools(
  decodedPools: Array<{ address: string; state: DecodedPoolState }>,
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string,
): Promise<RawPool[]> {
  const vaultAndConfigAddresses = decodedPools.flatMap(({ state }) => [
    state.vaultA,
    state.vaultB,
    state.configId,
  ]);

  const accountsMap = await rpcClient.getMultipleAccounts(vaultAndConfigAddresses);
  const pools: RawPool[] = [];

  for (const { address, state } of decodedPools) {
    const vault0Info = accountsMap.get(state.vaultA.toString());
    const vault1Info = accountsMap.get(state.vaultB.toString());
    const configInfo = accountsMap.get(state.configId.toString());

    if (!vault0Info || !vault1Info) {
      logger.debug('Vault account missing', { address: address.slice(0, 8) });
      continue;
    }

    const reserve0 = readVaultBalance(vault0Info);
    const reserve1 = readVaultBalance(vault1Info);

    if (reserve0 === null || reserve1 === null) {
      logger.debug('Failed to read vault balance', { address: address.slice(0, 8) });
      continue;
    }

    const feeBps = configInfo ? parseAmmConfigFee(configInfo) : DEFAULT_FEE_BPS;
    const pool = buildRawPool(address, state, reserve0, reserve1, feeBps, mintA, mintB);

    if (pool) pools.push(pool);
  }

  return pools;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Build filters for getProgramAccounts.
 * Offsets from SDK layout. Mints sorted by raw bytes to match Raydium on-chain ordering.
 */
export function buildPoolFilters(mintA: string, mintB: string): GetProgramAccountsFilter[] {
  const [token0, token1] = sortMintsByBytes(mintA, mintB);

  return [
    { dataSize: CPMM_POOL_ACCOUNT_SIZE },
    { memcmp: { offset: TOKEN_0_MINT_OFFSET, bytes: token0 } },
    { memcmp: { offset: TOKEN_1_MINT_OFFSET, bytes: token1 } },
  ];
}

// ---------------------------------------------------------------------------
// Full discovery (stage 1 → 2 → 3)
// ---------------------------------------------------------------------------

/**
 * Find all active CPMM pools for a token pair.
 * Uses getProgramAccounts to discover pool addresses, then fetches reserves.
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

  // --- Stage 1: getProgramAccounts -------------------------------------------

  const filters = buildPoolFilters(mintA, mintB);
  const rawAccounts = await rpcClient.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, filters);

  if (rawAccounts.length === 0) {
    logger.warn('No CPMM pools found', { mintA, mintB });
    return [];
  }

  logger.debug('Raw accounts fetched', { count: rawAccounts.length });

  // --- Stage 2: SDK decoding PoolState ---------------------------------------

  const decoded = rawAccounts
    .map(({ publicKey, account }) => {
      const state = decodePoolState(publicKey, account);
      if (!state) return null;
      if (!isSwapEnabled(state)) {
        logger.debug('Swap disabled, skipping pool', { address: publicKey.toString().slice(0, 8) });
        return null;
      }
      return { address: publicKey.toString(), state };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (decoded.length === 0) {
    logger.warn('All pool accounts failed to decode or swap is disabled');
    return [];
  }

  // --- Stage 3: Vault balances + AmmConfig fee (shared helper) ---------------

  const pools = await assembleRawPools(decoded, rpcClient, mintA, mintB);

  // --- Cache (with eviction) -------------------------------------------------

  if (useCache && pools.length > 0) {
    evictExpiredCache();
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
// Reserve refresh (stages 2-3 only, no getProgramAccounts)
// ---------------------------------------------------------------------------

/**
 * Refresh reserve balances for a known set of pools.
 *
 * Unlike findPoolsForPair, this function skips stage 1 (getProgramAccounts)
 * and re-uses the existing pool addresses. It only re-fetches:
 *   - Pool account state (to check swap is still enabled)
 *   - Vault balances (reserves)
 *   - AmmConfig fee rate
 *
 * Falls back to full discovery via findPoolsForPair if all known pools
 * have disappeared from the chain (e.g. migration or closure).
 *
 * @param knownPools  - previously discovered pools (addresses used for lookup)
 * @param rpcClient   - RPC client
 * @param mintA       - token A mint (used for RawPool assembly validation)
 * @param mintB       - token B mint (used for RawPool assembly validation)
 * @returns updated RawPool array, or result of full re-discovery if empty
 */
export async function refreshPoolReserves(
  knownPools: RawPool[],
  rpcClient: SolanaRpcClient,
  mintA: string,
  mintB: string,
): Promise<RawPool[]> {
  if (knownPools.length === 0) {
    logger.debug('No known pools to refresh, falling back to discovery');
    return findPoolsForPair(rpcClient, mintA, mintB, false);
  }

  // Fetch current on-chain state for all known pool addresses
  const poolAddresses = knownPools.map((p) => new PublicKey(p.address));
  const poolAccounts = await rpcClient.getMultipleAccounts(poolAddresses);

  // Decode and filter active pools (stages 2)
  const decodedPools: Array<{ address: string; state: DecodedPoolState }> = [];

  for (const pool of knownPools) {
    const accountInfo = poolAccounts.get(pool.address);
    if (!accountInfo) {
      logger.debug('Pool account not found during refresh', { address: pool.address.slice(0, 8) });
      continue;
    }

    const state = decodePoolState(new PublicKey(pool.address), accountInfo);
    if (!state || !isSwapEnabled(state)) continue;

    decodedPools.push({ address: pool.address, state });
  }

  // If all pools disappeared, trigger full re-discovery
  if (decodedPools.length === 0) {
    logger.warn('All pools disappeared during refresh, re-discovering...');
    return findPoolsForPair(rpcClient, mintA, mintB, false);
  }

  // Fetch vault balances + fees, assemble RawPools (stage 3)
  const updatedPools = await assembleRawPools(decodedPools, rpcClient, mintA, mintB);

  logger.debug('Pool reserves refreshed', {
    known: knownPools.length,
    updated: updatedPools.length,
  });

  return updatedPools;
}