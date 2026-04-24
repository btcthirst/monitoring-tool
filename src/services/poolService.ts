// services/poolService.ts
/**
 * Glue layer між solana/ та core/.
 *
 * Відповідальність:
 * - Об'єднує RPC клієнт + pool discovery в один зручний сервіс
 * - Надає методи для orchestrator без прямих залежностей на solana/
 * - Кешування на рівні сервісу (делегує до poolDiscovery)
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
   * Пошук пулів для пари токенів.
   * При першому виклику — повний discovery з кешуванням.
   */
  async discoverPools(mintA: string, mintB: string): Promise<RawPool[]> {
    logger.debug('PoolService.discoverPools', { mintA, mintB });
    return findPoolsForPair(this.rpcClient, mintA, mintB, true);
  }

  /**
   * Примусове оновлення пулів (без кешу).
   * Використовується при re-discovery після помилки.
   */
  async refreshPools(mintA: string, mintB: string): Promise<RawPool[]> {
    logger.debug('PoolService.refreshPools (no cache)', { mintA, mintB });
    return findPoolsForPair(this.rpcClient, mintA, mintB, false);
  }

  /**
   * Очищення кешу пулів.
   */
  clearCache(): void {
    clearPoolCache();
  }

  getRpcClient(): SolanaRpcClient {
    return this.rpcClient;
  }
}