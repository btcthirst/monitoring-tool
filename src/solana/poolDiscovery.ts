// solana/poolDiscovery.ts
/**
 * Discovery and loading of Raydium CPMM pools via SDK v2.
 *
 * Discovery process (3 stages):
 * 1. getProgramAccounts with dataSize + memcmp filters -> pool accounts
 * 2. SDK decodes PoolState -> retrieve vault addresses and configId
 * 3. getMultipleAccounts for vaults -> reserves; for configIds -> fee rates
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
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

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

export function clearPoolCache(): void {
  poolCache.clear();
  logger.debug('Pool cache cleared');
}

// ---------------------------------------------------------------------------
// Filters
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
// Main discovery function
// ---------------------------------------------------------------------------

/**
 * Find all active CPMM pools for a token pair.
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
      return { address: publicKey, state };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (decoded.length === 0) {
    logger.warn('All pool accounts failed to decode or swap is disabled');
    return [];
  }

  // --- Stage 3: Vault balances + AmmConfig fee ------------------------------

  // Gather all vault + configId addresses in a single batch request
  const vaultAndConfigAddresses = decoded.flatMap(({ state }) => [
    state.vaultA,
    state.vaultB,
    state.configId,
  ]);

  const accountsMap = await rpcClient.getMultipleAccounts(vaultAndConfigAddresses);

  // --- Assemble RawPool -----------------------------------------------------

  const pools: RawPool[] = [];

  for (const { address, state } of decoded) {
    const vault0Info = accountsMap.get(state.vaultA.toString());
    const vault1Info = accountsMap.get(state.vaultB.toString());
    const configInfo = accountsMap.get(state.configId.toString());

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

  // --- Caching -------------------------------------------------------------

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
// Pool Activity Check
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