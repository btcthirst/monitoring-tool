// core/orchestrator.ts
/**
 * Головний оркестратор моніторингу арбітражних можливостей.
 *
 * Відповідальність:
 * - Координація всіх модулів
 * - Головний цикл моніторингу
 * - Обробка помилок та перезапуски
 * - Управління життєвим циклом
 *
 * Принцип: мінімум бізнес-логіки — тільки координація.
 */

import { SolanaRpcClient } from '../solana/client';
import { findPoolsForPair } from '../solana/poolDiscovery';
import { parsePoolAccount } from '../solana/parsers';
import { findArbitrageOpportunities, getTopOpportunities, getOpportunityStats } from './arbitrage';
import { normalizePool } from './pricing';
import { RawPool, NormalizedPool, ArbitrageConfig, Opportunity } from './types';
import { Renderer } from '../ui/renderer';
import { logger, setLogLevel, logError, logOpportunity } from '../logger/logger';
import { sleep, PerformanceTimer, PeriodicExecutor } from '../utils/time';
import { formatNumber } from '../utils/math';
import { PublicKey } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  rpcUrl: string;
  mintA: string;
  mintB: string;
  quoteMint: string;
  pollingIntervalMs: number;
  minProfitThreshold: number;
  tradeSize: number;
  maxSlippagePercent: number;
  txCostInQuote: number;
  logLevel?: string;
}

interface MonitoringState {
  isRunning: boolean;
  poolsFound: number;
  lastUpdateTime: number;
  totalUpdates: number;
  totalOpportunities: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Клас
// ---------------------------------------------------------------------------

export class ArbitrageOrchestrator {
  private readonly rpcClient: SolanaRpcClient;
  private readonly renderer: Renderer;
  private readonly config: ArbitrageConfig;
  private readonly mintA: string;
  private readonly mintB: string;
  private readonly pollingIntervalMs: number;

  private executor: PeriodicExecutor | null = null;
  private rawPools: RawPool[] = [];
  private lastOpportunities: Opportunity[] = [];

  private state: MonitoringState = {
    isRunning: false,
    poolsFound: 0,
    lastUpdateTime: 0,
    totalUpdates: 0,
    totalOpportunities: 0,
  };

  constructor(config: OrchestratorConfig) {
    // Зберігаємо всі потрібні поля
    this.mintA = config.mintA;
    this.mintB = config.mintB;
    this.pollingIntervalMs = config.pollingIntervalMs;

    this.config = {
      tradeSize: config.tradeSize,
      minProfit: config.minProfitThreshold,
      maxSlippage: config.maxSlippagePercent,
      txCostInQuote: config.txCostInQuote,
      quoteMint: config.quoteMint,
    };

    this.rpcClient = new SolanaRpcClient(config.rpcUrl);
    this.renderer = new Renderer();

    // Оновлюємо рівень логування якщо передано
    if (config.logLevel) {
      setLogLevel(config.logLevel as any);
    }

    logger.info('ArbitrageOrchestrator initialized', {
      mintA: config.mintA,
      mintB: config.mintB,
      quoteMint: config.quoteMint,
      pollingIntervalMs: config.pollingIntervalMs,
      tradeSize: config.tradeSize,
      minProfitThreshold: config.minProfitThreshold,
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    logger.info('Starting arbitrage monitor...');
    this.state.isRunning = true;

    this.renderer.renderConnecting(this.rpcClient.getRpcUrl());

    // Фаза 1: discovery пулів
    const discovered = await this.discoverPools();
    if (!discovered) {
      logger.error('Pool discovery failed, cannot start monitoring');
      this.state.isRunning = false;
      return;
    }

    this.renderer.renderConnected(this.state.poolsFound);

    // Фаза 2: основний цикл
    this.executor = new PeriodicExecutor(
      () => this.updateCycle(),
      this.pollingIntervalMs,
      (error) => this.handleUpdateError(error),
    );

    this.executor.start();
    logger.info('Monitoring started successfully', { pools: this.state.poolsFound });
  }

  stop(): void {
    if (!this.state.isRunning) {
      logger.warn('Orchestrator not running');
      return;
    }

    this.state.isRunning = false;
    this.executor?.stop();
    this.executor = null;

    logger.info('Monitoring stopped', {
      totalUpdates: this.state.totalUpdates,
      totalOpportunities: this.state.totalOpportunities,
    });
  }

  // ---------------------------------------------------------------------------
  // Фаза 1: Discovery
  // ---------------------------------------------------------------------------

  private async discoverPools(): Promise<boolean> {
    const timer = new PerformanceTimer('PoolDiscovery');

    try {
      logger.info('Discovering pools...', { mintA: this.mintA, mintB: this.mintB });

      this.rawPools = await findPoolsForPair(this.rpcClient, this.mintA, this.mintB);

      if (this.rawPools.length === 0) {
        logger.error('No pools found for the given token pair', {
          mintA: this.mintA,
          mintB: this.mintB,
        });
        return false;
      }

      if (this.rawPools.length < 2) {
        logger.warn('Only one pool found — arbitrage requires at least 2 pools', {
          poolAddress: this.rawPools[0]?.address,
        });
        // Не зупиняємо — продовжуємо моніторинг, раптом з'явиться другий
      }

      this.state.poolsFound = this.rawPools.length;
      const { elapsedFormatted } = timer.stop();

      logger.info('Pool discovery completed', {
        poolsFound: this.state.poolsFound,
        elapsed: elapsedFormatted,
        addresses: this.rawPools.map((p) => p.address.slice(0, 8)),
      });

      return true;
    } catch (error) {
      logError(error as Error, 'discoverPools');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Фаза 2: Основний цикл
  // ---------------------------------------------------------------------------

  private async updateCycle(): Promise<void> {
    const timer = new PerformanceTimer('UpdateCycle');

    // Перевірка RPC
    const healthy = await this.rpcClient.healthCheck();
    if (!healthy) {
      logger.warn('RPC health check failed, skipping cycle');
      return;
    }

    // Оновлення резервів
    await this.refreshPoolData();

    // Пошук можливостей
    const opportunities = findArbitrageOpportunities(this.rawPools, this.config);
    const topOpps = getTopOpportunities(opportunities, 15);

    this.lastOpportunities = topOpps;
    this.state.totalUpdates++;
    this.state.totalOpportunities += opportunities.length;
    this.state.lastUpdateTime = Date.now();

    // Рендеринг
    this.renderer.render(topOpps, {
      minProfit: this.config.minProfit,
      quoteMint: this.config.quoteMint,
      pollingIntervalMs: this.pollingIntervalMs,
      tradeSize: this.config.tradeSize,
    });

    // Логування найкращої можливості
    if (opportunities.length > 0 && opportunities[0]) {
      const best = opportunities[0];
      logOpportunity(
        best.netProfit,
        best.profitPercent,
        best.buyPool.address,
        best.sellPool.address,
      );
    }

    // Статистика кожні 10 циклів
    if (this.state.totalUpdates % 10 === 0) {
      const stats = getOpportunityStats(opportunities);
      const { elapsedMs } = timer.stop();

      logger.info('Cycle stats', {
        cycle: this.state.totalUpdates,
        pools: this.state.poolsFound,
        opportunities: opportunities.length,
        maxProfit: formatNumber(stats.maxProfit),
        avgProfit: formatNumber(stats.avgProfit),
        cycleMs: elapsedMs,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Оновлення резервів пулів
  // ---------------------------------------------------------------------------

  private async refreshPoolData(): Promise<void> {
    if (this.rawPools.length === 0) return;

    const addresses = this.rawPools.map((p) => new PublicKey(p.address));
    const accounts = await this.rpcClient.getMultipleAccounts(addresses);

    let updatedCount = 0;
    const updatedPools: RawPool[] = [];

    for (const pool of this.rawPools) {
      const accountInfo = accounts.get(pool.address);

      if (accountInfo?.data) {
        // Парсимо оновлений стан пулу з блокчейну
        const updated = parsePoolAccount(
          new PublicKey(pool.address),
          accountInfo,
          this.mintA,
          this.mintB,
        );

        if (updated) {
          updatedPools.push(updated);
          updatedCount++;
        } else {
          // Пул більше не валідний — прибираємо
          logger.debug('Pool account became invalid, removing', { address: pool.address.slice(0, 8) });
        }
      } else {
        // Акаунт не повернувся — зберігаємо старі дані
        updatedPools.push(pool);
      }
    }

    this.rawPools = updatedPools;
    this.state.poolsFound = updatedPools.length;

    logger.debug('Pool data refreshed', {
      total: this.rawPools.length,
      updated: updatedCount,
    });

    // Якщо всі пули зникли — запускаємо re-discovery
    if (this.rawPools.length === 0) {
      logger.warn('All pools disappeared, re-discovering...');
      await this.discoverPools();
    }
  }

  // ---------------------------------------------------------------------------
  // Обробка помилок
  // ---------------------------------------------------------------------------

  private handleUpdateError(error: Error): void {
    this.state.lastError = error.message;
    logError(error, 'updateCycle');

    // При RPC помилці — скидаємо пули для re-discovery на наступному циклі
    if (
      error.message.includes('RPC call failed') ||
      error.message.includes('failed to fetch')
    ) {
      logger.warn('RPC error detected, will re-discover pools on next cycle');
      this.rawPools = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Публічний стан
  // ---------------------------------------------------------------------------

  getState(): Readonly<MonitoringState> {
    return { ...this.state };
  }

  getLastOpportunities(): Opportunity[] {
    return [...this.lastOpportunities];
  }
}

// ---------------------------------------------------------------------------
// Фабрична функція
// ---------------------------------------------------------------------------

/**
 * Створення та запуск оркестратора.
 * Реєструє обробники SIGINT/SIGTERM для graceful shutdown.
 */
export async function startMonitor(
  config: OrchestratorConfig,
): Promise<ArbitrageOrchestrator> {
  const orchestrator = new ArbitrageOrchestrator(config);

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, stopping...');
    orchestrator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, stopping...');
    orchestrator.stop();
    process.exit(0);
  });

  await orchestrator.start();
  return orchestrator;
}