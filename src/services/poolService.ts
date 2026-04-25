// services/poolService.ts
/**
 * Glue layer between solana/ and core/.
 *
 * Responsibilities:
 * - Unifies RPC client + pool discovery into a single convenient service
 * - Provides methods for the orchestrator without direct dependencies on solana/
 * - Service-level caching (delegated to poolDiscovery)
 */

import { SolanaRpcClient } from '../solana/client';
import { findPoolsForPair, clearPoolCache } from '../solana/poolDiscovery';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';

export class PoolService {
  private readonly rpcClient: SolanaRpcClient;

  constructor(rpcUrl: string) {
    this.rpcClient = new SolanaRpcClient(rpcUrl);
  }

  /**
   * Search for pools for a token pair.
   * On first call — full discovery with caching.
   */
  async discoverPools(mintA: string, mintB: string): Promise<RawPool[]> {
    logger.debug('PoolService.discoverPools', { mintA, mintB });
    return findPoolsForPair(this.rpcClient, mintA, mintB, true);
  }

  /**
   * Force refresh pools (without cache).
   * Used during re-discovery after an error.
   */
  async refreshPools(mintA: string, mintB: string): Promise<RawPool[]> {
    logger.debug('PoolService.refreshPools (no cache)', { mintA, mintB });
    return findPoolsForPair(this.rpcClient, mintA, mintB, false);
  }

  /**
   * Clear pool cache.
   */
  clearCache(): void {
    clearPoolCache();
  }

  getRpcClient(): SolanaRpcClient {
    return this.rpcClient;
  }
}