// solana/client.ts
/**
 * RPC клієнт для роботи з Solana блокчейном.
 *
 * Особливості:
 * - Retry з експоненційним backoff
 * - Rate limiting між запитами
 * - Chunking для getMultipleAccounts (ліміт 100 акаунтів за запит)
 * - Читання балансу SPL Token vault акаунтів
 */

import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
  AccountInfo,
  Commitment,
} from '@solana/web3.js';
import { Buffer } from 'node:buffer';
import { logger, logRpcCall } from '../logger/logger';
import {
  RPC_RETRY_ATTEMPTS,
  RPC_RETRY_DELAY_MS,
  MAX_ACCOUNTS_PER_RPC_CALL,
  SPL_TOKEN_AMOUNT_OFFSET,
} from './constants';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

export type RpcOptions = {
  commitment?: Commitment;
  retries?: number;
};

export type MultipleAccountsResult = Map<string, AccountInfo<Buffer> | null>;

// ---------------------------------------------------------------------------
// Клас
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
      disableRetryOnRateLimit: true, // Retry робимо самі
    });
    logger.debug('RPC Client initialized', { rpcUrl, commitment });
  }

  // ---------------------------------------------------------------------------
  // Публічні методи
  // ---------------------------------------------------------------------------

  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Отримання програмних акаунтів з фільтрами.
   */
  async getProgramAccounts(
    programId: PublicKey,
    filters: GetProgramAccountsFilter[],
    options?: RpcOptions,
  ): Promise<{ publicKey: PublicKey; account: AccountInfo<Buffer> }[]> {
    const start = Date.now();
    const result = await this.withRetry(
      () =>
        this.connection.getProgramAccounts(programId, {
          filters,
          commitment: options?.commitment,
          encoding: 'base64',
        }),
      'getProgramAccounts',
      options?.retries,
    );

    logRpcCall('getProgramAccounts', Date.now() - start, true);
    logger.debug('getProgramAccounts completed', {
      programId: programId.toString().slice(0, 8),
      found: result.length,
    });

    return result;
  }

  /**
   * Отримання інформації про множинні акаунти.
   * Автоматично розбиває на chunks по MAX_ACCOUNTS_PER_RPC_CALL.
   */
  async getMultipleAccounts(
    publicKeys: PublicKey[],
    options?: RpcOptions,
  ): Promise<MultipleAccountsResult> {
    if (publicKeys.length === 0) return new Map();

    const start = Date.now();

    // Розбиваємо на chunks
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

            const result = new Map<string, AccountInfo<Buffer> | null>();
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

    // Об'єднуємо результати
    const combined: MultipleAccountsResult = new Map();
    for (const chunk of chunkResults) {
      for (const [key, value] of chunk) {
        combined.set(key, value);
      }
    }

    logRpcCall('getMultipleAccounts', Date.now() - start, true, { count: publicKeys.length });
    return combined;
  }

  /**
   * Отримання одного акаунту.
   */
  async getAccountInfo(
    publicKey: PublicKey,
    options?: RpcOptions,
  ): Promise<AccountInfo<Buffer> | null> {
    const results = await this.getMultipleAccounts([publicKey], options);
    return results.get(publicKey.toString()) ?? null;
  }

  /**
   * Читання балансу SPL Token акаунту (vault резерв).
   *
   * SPL Token account layout:
   *   0..32  mint
   *  32..64  owner
   *  64..72  amount (u64, little-endian)  ← SPL_TOKEN_AMOUNT_OFFSET
   *
   * @returns баланс як bigint або null якщо акаунт не знайдено
   */
  async getTokenAccountBalance(vaultAddress: PublicKey): Promise<bigint | null> {
    const accountInfo = await this.getAccountInfo(vaultAddress);

    if (!accountInfo?.data) return null;

    const data = accountInfo.data;
    if (data.length < SPL_TOKEN_AMOUNT_OFFSET + 8) {
      logger.warn('Token account data too small', {
        address: vaultAddress.toString().slice(0, 8),
        size: data.length,
      });
      return null;
    }

    return data.readBigUInt64LE(SPL_TOKEN_AMOUNT_OFFSET);
  }

  /**
   * Читання decimals з SPL Mint акаунту.
   * Mint layout: ... decimals знаходиться на офсеті 44.
   */
  async getMintDecimals(mintAddress: PublicKey): Promise<number | null> {
    const accountInfo = await this.getAccountInfo(mintAddress);

    if (!accountInfo?.data || accountInfo.data.length < 45) return null;

    return accountInfo.data.readUInt8(44);
  }

  /**
   * Перевірка з'єднання з RPC.
   */
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
  // Приватні хелпери
  // ---------------------------------------------------------------------------

  /**
   * Rate limiting — мінімальний інтервал між запитами.
   */
  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minRequestIntervalMs) {
      await sleep(this.minRequestIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Виконання запиту з retry та експоненційним backoff.
   */
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

        if (attempt < retries) {
          await sleep(delay);
        }
      }
    }

    throw new Error(`RPC call failed after ${retries} attempts [${context}]: ${lastError?.message}`);
  }
}

// ---------------------------------------------------------------------------
// Хелпери
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Фабрична функція.
 */
export function createRpcClient(rpcUrl: string, commitment?: Commitment): SolanaRpcClient {
  return new SolanaRpcClient(rpcUrl, commitment);
}