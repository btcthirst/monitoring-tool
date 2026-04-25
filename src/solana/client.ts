// solana/client.ts
/**
 * RPC client for interacting with the Solana blockchain.
 *
 * Features:
 * - Retry with exponential backoff
 * - Rate limiting between requests
 * - Chunking for getMultipleAccounts (limit 100 accounts per request)
 */

import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
  AccountInfo,
  Commitment,
} from '@solana/web3.js';
import { logger, logRpcCall } from '../logger/logger';
import {
  RPC_RETRY_ATTEMPTS,
  RPC_RETRY_DELAY_MS,
  MAX_ACCOUNTS_PER_RPC_CALL,
} from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RpcOptions = {
  commitment?: Commitment;
  retries?: number;
};

export type MultipleAccountsResult = Map<string, AccountInfo<Buffer> | null>;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class SolanaRpcClient {
  private readonly connection: Connection;
  private readonly rpcUrl: string;
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 50;

  constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, {
      commitment,
      disableRetryOnRateLimit: true,
    });
    logger.debug('RPC Client initialized', { rpcUrl, commitment });
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  async getProgramAccounts(
    programId: PublicKey,
    filters: GetProgramAccountsFilter[],
    options?: RpcOptions,
  ): Promise<{ publicKey: PublicKey; account: AccountInfo<Buffer> }[]> {
    const start = Date.now();

    const commitment = options?.commitment;
    const result = await this.withRetry(
      () =>
        this.connection.getProgramAccounts(programId, {
          filters,
          ...(commitment !== undefined && { commitment }),
          encoding: 'base64',
        }),
      'getProgramAccounts',
      options?.retries,
    );

    logRpcCall('getProgramAccounts', Date.now() - start, true);
    logger.debug('getProgramAccounts', {
      programId: programId.toString().slice(0, 8),
      found: result.length,
    });

    return result.map(({ pubkey, account }) => ({ publicKey: pubkey, account }));
  }

  /**
   * Fetch multiple accounts.
   * Accepts PublicKey[] — automatically splits into chunks.
   */
  async getMultipleAccounts(
    publicKeys: PublicKey[],
    options?: RpcOptions,
  ): Promise<MultipleAccountsResult> {
    if (publicKeys.length === 0) return new Map();

    const start = Date.now();
    const chunks: PublicKey[][] = [];

    for (let i = 0; i < publicKeys.length; i += MAX_ACCOUNTS_PER_RPC_CALL) {
      chunks.push(publicKeys.slice(i, i + MAX_ACCOUNTS_PER_RPC_CALL));
    }

    const chunkResults = await Promise.all(
      chunks.map((chunk, idx) =>
        this.withRetry(
          async () => {
            const accounts = await this.connection.getMultipleAccountsInfo(
              chunk,
              options?.commitment,
            );
            const result: MultipleAccountsResult = new Map();
            chunk.forEach((key, i) => {
              result.set(key.toString(), accounts[i] ?? null);
            });
            return result;
          },
          `getMultipleAccounts chunk ${idx + 1}/${chunks.length}`,
          options?.retries,
        ),
      ),
    );

    const combined: MultipleAccountsResult = new Map();
    for (const chunk of chunkResults) {
      for (const [key, value] of chunk) {
        combined.set(key, value);
      }
    }

    logRpcCall('getMultipleAccounts', Date.now() - start, true, { count: publicKeys.length });
    return combined;
  }

  async getAccountInfo(
    publicKey: PublicKey,
    options?: RpcOptions,
  ): Promise<AccountInfo<Buffer> | null> {
    const results = await this.getMultipleAccounts([publicKey], options);
    return results.get(publicKey.toString()) ?? null;
  }

  async getMintDecimals(mintAddress: PublicKey): Promise<number | null> {
    const accountInfo = await this.getAccountInfo(mintAddress);
    if (!accountInfo?.data || accountInfo.data.length < 45) return null;
    return accountInfo.data.readUInt8(44);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const start = Date.now();
      await this.withRetry(() => this.connection.getSlot(), 'healthCheck', 1);
      logRpcCall('healthCheck', Date.now() - start, true);
      return true;
    } catch {
      logger.warn('RPC health check failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minRequestIntervalMs) {
      await sleep(this.minRequestIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    retries: number = RPC_RETRY_ATTEMPTS,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.rateLimit();
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const delay = RPC_RETRY_DELAY_MS * Math.pow(2, attempt - 1);

        logger.warn(`RPC attempt ${attempt}/${retries} failed`, {
          context,
          error: lastError.message,
          retryInMs: attempt < retries ? delay : null,
        });

        if (attempt < retries) await sleep(delay);
      }
    }

    throw new Error(
      `RPC call failed after ${retries} attempts [${context}]: ${lastError?.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRpcClient(rpcUrl: string, commitment?: Commitment): SolanaRpcClient {
  return new SolanaRpcClient(rpcUrl, commitment);
}