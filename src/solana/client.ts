// solana/client.ts
/**
 * RPC клієнт для роботи з Solana блокчейном
 * Включає retry логіку, rate limiting та оптимізовані виклики
 */

import {
    Connection,
    PublicKey,
    GetProgramAccountsFilter,
    AccountInfo,
    Commitment,
  } from '@solana/web3.js';
  import { logger } from '../logger/logger';
  import {
    RPC_RETRY_ATTEMPTS,
    RPC_RETRY_DELAY_MS,
    MAX_ACCOUNTS_PER_RPC_CALL,
  } from './constants';
  
  /**
   * Опції для RPC запитів
   */
  export type RpcOptions = {
    commitment?: Commitment;
    retries?: number;
  };
  
  /**
   * Результат getMultipleAccountsInfo з мапінгом
   */
  export type MultipleAccountsResult = Map<string, AccountInfo<Buffer> | null>;
  
  /**
   * RPC клієнт з retry та rate limiting
   */
  export class SolanaRpcClient {
    private connection: Connection;
    private lastRequestTime: number = 0;
    private minRequestIntervalMs: number = 100; // Мінімальний інтервал між запитами
  
    constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
      this.connection = new Connection(rpcUrl, commitment);
      logger.info('RPC Client initialized', { rpcUrl, commitment });
    }
  
    /**
     * Затримка між запитами для уникнення rate limiting
     */
    private async rateLimit(): Promise<void> {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestIntervalMs) {
        const delay = this.minRequestIntervalMs - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      this.lastRequestTime = Date.now();
    }
  
    /**
     * Виконання запиту з retry логікою
     */
    private async withRetry<T>(
      operation: () => Promise<T>,
      context: string,
      retries: number = RPC_RETRY_ATTEMPTS
    ): Promise<T> {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await this.rateLimit();
          return await operation();
        } catch (error) {
          lastError = error as Error;
          const delay = RPC_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          
          logger.warn(`RPC call failed (attempt ${attempt}/${retries})`, {
            context,
            error: error instanceof Error ? error.message : String(error),
            nextRetryMs: delay,
          });
          
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      logger.error('RPC call failed after all retries', { context, error: lastError });
      throw new Error(`RPC call failed: ${context} - ${lastError?.message}`);
    }
  
    /**
     * Отримання програмних акаунтів з фільтрами
     */
    async getProgramAccounts(
      programId: PublicKey,
      filters: GetProgramAccountsFilter[],
      options?: RpcOptions
    ): Promise<{ publicKey: PublicKey; account: AccountInfo<Buffer> }[]> {
      const retries = options?.retries ?? RPC_RETRY_ATTEMPTS;
      
      return this.withRetry(
        async () => {
          const accounts = await this.connection.getProgramAccounts(programId, {
            filters,
            commitment: options?.commitment,
            encoding: 'base64',
          });
          
          logger.debug('getProgramAccounts completed', {
            programId: programId.toString(),
            accountsFound: accounts.length,
            filters: filters.length,
          });
          
          return accounts;
        },
        'getProgramAccounts',
        retries
      );
    }
  
    /**
     * Отримання інформації про множинні акаунти
     * Оптимізовано: не виконує запит при порожньому масиві
     */
    async getMultipleAccounts(
      publicKeys: PublicKey[],
      options?: RpcOptions
    ): Promise<MultipleAccountsResult> {
      // Оптимізація: не виконуємо запит при порожньому масиві
      // Джерело: Solana Web3.js issue #2757 [citation:3]
      if (publicKeys.length === 0) {
        logger.debug('getMultipleAccounts called with empty array, skipping RPC call');
        return new Map();
      }
      
      const retries = options?.retries ?? RPC_RETRY_ATTEMPTS;
      
      // Розбиваємо на чанки по MAX_ACCOUNTS_PER_RPC_CALL
      const chunks: PublicKey[][] = [];
      for (let i = 0; i < publicKeys.length; i += MAX_ACCOUNTS_PER_RPC_CALL) {
        chunks.push(publicKeys.slice(i, i + MAX_ACCOUNTS_PER_RPC_CALL));
      }
      
      const results = await Promise.all(
        chunks.map(async (chunk, index) => {
          return this.withRetry(
            async () => {
              const accounts = await this.connection.getMultipleAccountsInfo(
                chunk,
                options?.commitment
              );
              
              const chunkResult = new Map<string, AccountInfo<Buffer> | null>();
              chunk.forEach((key, i) => {
                chunkResult.set(key.toString(), accounts[i] ?? null);
              });
              
              logger.debug('getMultipleAccounts chunk completed', {
                chunk: index + 1,
                totalChunks: chunks.length,
                requested: chunk.length,
                received: accounts.filter(a => a !== null).length,
              });
              
              return chunkResult;
            },
            `getMultipleAccounts chunk ${index + 1}`,
            retries
          );
        })
      );
      
      // Об'єднуємо результати
      const combined = new Map<string, AccountInfo<Buffer> | null>();
      for (const result of results) {
        for (const [key, value] of result) {
          combined.set(key, value);
        }
      }
      
      return combined;
    }
  
    /**
     * Отримання інформації про один акаунт
     */
    async getAccountInfo(
      publicKey: PublicKey,
      options?: RpcOptions
    ): Promise<AccountInfo<Buffer> | null> {
      const results = await this.getMultipleAccounts([publicKey], options);
      return results.get(publicKey.toString()) ?? null;
    }
  
    /**
     * Отримання інформації про mint акаунт (для децималів)
     */
    async getMintInfo(mintAddress: PublicKey): Promise<{ decimals: number } | null> {
      const accountInfo = await this.getAccountInfo(mintAddress);
      
      if (!accountInfo || !accountInfo.data) {
        return null;
      }
      
      // SPL Mint account layout - decimals знаходиться на офсеті 44
      // Джерело: SPL Token program specification
      const data = accountInfo.data;
      if (data.length < 45) {
        return null;
      }
      
      const decimals = data.readUInt8(44);
      return { decimals };
    }
  
    /**
     * Перевірка з'єднання з RPC
     */
    async healthCheck(): Promise<boolean> {
      try {
        const slot = await this.withRetry(
          () => this.connection.getSlot(),
          'healthCheck',
          1
        );
        logger.info('RPC health check passed', { slot });
        return true;
      } catch (error) {
        logger.error('RPC health check failed', { error });
        return false;
      }
    }
  }
  
  /**
   * Фабрика для створення RPC клієнта
   */
  export function createRpcClient(rpcUrl: string, commitment?: Commitment): SolanaRpcClient {
    return new SolanaRpcClient(rpcUrl, commitment);
  }