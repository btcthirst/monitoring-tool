// services/poolService.ts
import { SolanaRpcClient } from '../solana/client';
import { findPoolsForPair, clearPoolCache } from '../solana/poolDiscovery';
import { RawPool } from '../core/types';
import { logger } from '../logger/logger';

export class PoolService {
  private rpcClient: SolanaRpcClient;
  private cachedPools: Map<string, RawPool[]> = new Map();
  private cacheTimestamp: Map<string, number> = new Map();
  private cacheTtlMs: number = 30000; // 30 секунд

  constructor(rpcUrl: string) {
    this.rpcClient = new SolanaRpcClient(rpcUrl);
  }

  async discoverPools(mintA: string, mintB: string): Promise<RawPool[]> {
    const cacheKey = `${mintA}:${mintB}`;
    const cached = this.cachedPools.get(cacheKey);
    const timestamp = this.cacheTimestamp.get(cacheKey) || 0;
    
    // Використовуємо кеш якщо він свіжий
    if (cached && Date.now() - timestamp < this.cacheTtlMs) {
      logger.debug('Using cached pools from service', { 
        mintA, 
        mintB, 
        count: cached.length 
      });
      return cached;
    }
    
    // Пошук пулів через poolDiscovery
    const pools = await findPoolsForPair(this.rpcClient, mintA, mintB);
    
    // Оновлення кешу
    this.cachedPools.set(cacheKey, pools);
    this.cacheTimestamp.set(cacheKey, Date.now());
    
    return pools;
  }

  async refreshPools(mintA: string, mintB: string): Promise<RawPool[]> {
    // Примусове оновлення (ігноруємо кеш)
    logger.info('Force refreshing pools', { mintA, mintB });
    const pools = await findPoolsForPair(this.rpcClient, mintA, mintB);
    
    const cacheKey = `${mintA}:${mintB}`;
    this.cachedPools.set(cacheKey, pools);
    this.cacheTimestamp.set(cacheKey, Date.now());
    
    return pools;
  }

  clearCache(): void {
    this.cachedPools.clear();
    this.cacheTimestamp.clear();
    clearPoolCache();
    logger.info('Pool service cache cleared');
  }

  async healthCheck(): Promise<boolean> {
    return this.rpcClient.healthCheck();
  }
}