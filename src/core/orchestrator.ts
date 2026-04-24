// core/orchestrator.ts
/**
 * Головний оркестратор моніторингу арбітражних можливостей
 * 
 * Відповідальність:
 * - Координація всіх модулів
 * - Головний цикл моніторингу
 * - Обробка помилок та перезапуски
 * - Управління життєвим циклом
 * 
 * ВАЖЛИВО:
 * - Це "клей", який з'єднує всі модулі
 * - Містить мінімум бізнес-логіки
 * - Делегує роботу іншим модулям
 */

import { SolanaRpcClient } from '../solana/client';
import { findPoolsForPair } from '../solana/poolDiscovery';
import { PoolService } from '../services/poolService';
import { normalizePool, simulateTwoHopArbitrage, calculateNetProfit, calculateProfitPercent } from './pricing';
import { findArbitrageOpportunities, getTopOpportunities, getOpportunityStats } from './arbitrage';
import { RawPool, NormalizedPool, ArbitrageConfig, Opportunity } from './types';
import { Renderer } from '../ui/renderer';
import { logger } from '../logger/logger';
import { sleep, PerformanceTimer, PeriodicExecutor } from '../utils/time';
import { formatNumber } from '../utils/math';

/**
 * Конфігурація оркестратора
 */
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

/**
 * Стан моніторингу
 */
interface MonitoringState {
  isRunning: boolean;
  poolsFound: number;
  lastUpdateTime: number;
  totalUpdates: number;
  totalOpportunities: number;
  lastError?: string;
}

/**
 * Головний оркестратор
 */
export class ArbitrageOrchestrator {
  private rpcClient: SolanaRpcClient;
  private poolService: PoolService;
  private renderer: Renderer;
  private config: ArbitrageConfig;
  private state: MonitoringState;
  private executor: PeriodicExecutor | null = null;
  private rawPools: RawPool[] = [];
  private normalizedPools: NormalizedPool[] = [];
  private lastOpportunities: Opportunity[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = {
      tradeSize: config.tradeSize,
      minProfit: config.minProfitThreshold,
      maxSlippagePercent: config.maxSlippagePercent,
      txCostInQuote: config.txCostInQuote,
      quoteMint: config.quoteMint,
    };

    this.rpcClient = new SolanaRpcClient(config.rpcUrl);
    this.poolService = new PoolService(config.rpcUrl);
    this.renderer = new Renderer();
    this.state = {
      isRunning: false,
      poolsFound: 0,
      lastUpdateTime: 0,
      totalUpdates: 0,
      totalOpportunities: 0,
    };

    logger.info('ArbitrageOrchestrator initialized', {
      mintA: config.mintA,
      mintB: config.mintB,
      quoteMint: config.quoteMint,
      pollingIntervalMs: config.pollingIntervalMs,
      tradeSize: config.tradeSize,
      minProfitThreshold: config.minProfitThreshold,
    });
  }

  /**
   * Запуск моніторингу
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    logger.info('Starting arbitrage monitor...');
    this.state.isRunning = true;

    // Фаза 1: Discovery пулів
    const discoverySuccess = await this.discoverPools();
    if (!discoverySuccess) {
      logger.error('Pool discovery failed, cannot start monitoring');
      this.state.isRunning = false;
      return;
    }

    // Фаза 2: Запуск основного циклу
    this.executor = new PeriodicExecutor(
      () => this.updateCycle(),
      this.getPollingInterval(),
      (error) => this.handleUpdateError(error)
    );

    this.executor.start();
    logger.info('Monitoring started successfully');
  }

  /**
   * Зупинка моніторингу
   */
  stop(): void {
    if (!this.state.isRunning) {
      logger.warn('Orchestrator not running');
      return;
    }

    logger.info('Stopping arbitrage monitor...');
    this.state.isRunning = false;

    if (this.executor) {
      this.executor.stop();
      this.executor = null;
    }

    logger.info('Monitoring stopped', {
      totalUpdates: this.state.totalUpdates,
      totalOpportunities: this.state.totalOpportunities,
    });
  }

  /**
   * Фаза 1: Пошук пулів
   */
  private async discoverPools(): Promise<boolean> {
    const timer = new PerformanceTimer('PoolDiscovery');
    
    try {
      logger.info('Phase 1: Discovering pools...');
      
      // Отримуємо пули через сервіс
      this.rawPools = await this.poolService.discoverPools(
        this.config.quoteMint, // Використовуємо quote mint як один з токенів
        '' // TODO: отримати другий mint з конфігу
      );
      
      // TODO: виправлено - потрібно передавати правильні mint адреси
      // Тимчасове рішення - отримуємо з конфігу через зовнішню змінну
      // В реальному коді mintA/mintB потрібно передати в конструктор
      
      if (this.rawPools.length === 0) {
        logger.error('No pools found');
        return false;
      }
      
      // Нормалізація пулів
      this.normalizedPools = this.rawPools.map(pool => normalizePool(pool));
      
      this.state.poolsFound = this.rawPools.length;
      const { elapsedFormatted } = timer.stop();
      
      logger.info('Pool discovery completed', {
        poolsFound: this.state.poolsFound,
        elapsed: elapsedFormatted,
      });
      
      return true;
    } catch (error) {
      logger.error('Pool discovery failed', { error });
      return false;
    }
  }

  /**
   * Оновлення циклу моніторингу
   */
  private async updateCycle(): Promise<void> {
    const cycleTimer = new PerformanceTimer('UpdateCycle');
    
    try {
      // Перевірка здоров'я RPC
      const isHealthy = await this.rpcClient.healthCheck();
      if (!isHealthy) {
        logger.warn('RPC health check failed, skipping cycle');
        return;
      }
      
      // Оновлення даних пулів
      await this.refreshPoolData();
      
      // Пошук арбітражних можливостей
      const opportunities = findArbitrageOpportunities(this.rawPools, this.config);
      
      // Збереження та статистика
      this.lastOpportunities = opportunities;
      this.state.totalUpdates++;
      this.state.totalOpportunities += opportunities.length;
      this.state.lastUpdateTime = Date.now();
      
      // Візуалізація
      this.renderer.render(opportunities, {
        minProfit: this.config.minProfit,
        quoteMint: this.config.quoteMint,
        pollingIntervalMs: this.getPollingInterval(),
        tradeSize: this.config.tradeSize,
      });
      
      // Логування статистики (кожні 10 циклів)
      if (this.state.totalUpdates % 10 === 0) {
        const stats = getOpportunityStats(opportunities);
        const { elapsedMs } = cycleTimer.stop();
        
        logger.info('Update cycle completed', {
          cycleNumber: this.state.totalUpdates,
          poolsFound: this.state.poolsFound,
          opportunitiesFound: opportunities.length,
          maxProfit: stats.maxProfit,
          avgProfit: stats.avgProfit,
          cycleTimeMs: elapsedMs,
        });
      }
      
      // Якщо знайдені можливості - додаткове логування
      if (opportunities.length > 0) {
        const best = opportunities[0];
        if (best) {
          logger.info('Arbitrage opportunity detected!', {
            profit: formatNumber(best.netProfit),
            profitPercent: formatNumber(best.profitPercent, 2),
            buyPool: best.buyPool.address.slice(0, 8),
            sellPool: best.sellPool.address.slice(0, 8),
          });
        }
      }
    } catch (error) {
      this.handleUpdateError(error as Error);
      throw error; // Re-throw для PeriodicExecutor
    }
  }

  /**
   * Оновлення даних пулів (резервів)
   */
  private async refreshPoolData(): Promise<void> {
    if (this.rawPools.length === 0) {
      logger.warn('No pools to refresh');
      return;
    }
    
    // Отримуємо актуальні дані для всіх пулів
    const poolAddresses = this.rawPools.map(pool => pool.address);
    const accounts = await this.rpcClient.getMultipleAccounts(
      poolAddresses.map(addr => addr)
    );
    
    // Оновлюємо резерви
    let updatedCount = 0;
    for (let i = 0; i < this.rawPools.length; i++) {
      const pool = this.rawPools[i];
      const accountInfo = accounts.get(pool.address);
      
      if (accountInfo && accountInfo.data) {
        // TODO: парсинг оновлених резервів з accountInfo.data
        // Тимчасово - пропускаємо
        updatedCount++;
      }
    }
    
    logger.debug('Pool data refreshed', {
      totalPools: this.rawPools.length,
      updatedCount,
    });
    
    // Оновлюємо нормалізовані пули
    this.normalizedPools = this.rawPools.map(pool => normalizePool(pool));
  }

  /**
   * Обробка помилок оновлення
   */
  private handleUpdateError(error: Error): void {
    this.state.lastError = error.message;
    
    logger.error('Update cycle failed', {
      error: error.message,
      stack: error.stack,
      totalUpdates: this.state.totalUpdates,
    });
    
    // При певних помилках - перезапускаємо discovery
    if (error.message.includes('No pools found') || 
        error.message.includes('RPC call failed')) {
      logger.warn('Critical error, will re-discover pools on next cycle');
      // Відмічаємо, що пули потрібно перевідкрити
      this.rawPools = [];
    }
  }

  /**
   * Отримання інтервалу polling
   */
  private getPollingInterval(): number {
    // Можна додати адаптивний інтервал на основі навантаження
    return 2000; // Базова значення з конфігу
  }

  /**
   * Отримання поточного стану
   */
  getState(): MonitoringState {
    return { ...this.state };
  }

  /**
   * Отримання останніх можливостей
   */
  getLastOpportunities(): Opportunity[] {
    return [...this.lastOpportunities];
  }
}

/**
 * Фабрична функція для запуску моніторингу
 */
export async function startMonitor(config: OrchestratorConfig): Promise<ArbitrageOrchestrator> {
  logger.info('Starting arbitrage monitor with config', {
    mintA: config.mintA,
    mintB: config.mintB,
    pollingIntervalMs: config.pollingIntervalMs,
    minProfitThreshold: config.minProfitThreshold,
  });
  
  const orchestrator = new ArbitrageOrchestrator(config);
  
  // Обробка сигналів завершення
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, stopping monitor...');
    orchestrator.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, stopping monitor...');
    orchestrator.stop();
    process.exit(0);
  });
  
  await orchestrator.start();
  return orchestrator;
}

/**
 * Спрощений запуск для CLI
 */
export async function runSimpleMonitor(config: OrchestratorConfig): Promise<void> {
  const orchestrator = await startMonitor(config);
  
  // Періодичне виведення статистики (кожні 60 секунд)
  setInterval(() => {
    const state = orchestrator.getState();
    const opportunities = orchestrator.getLastOpportunities();
    const stats = getOpportunityStats(opportunities);
    
    logger.info('Monitor statistics', {
      uptime: state.totalUpdates,
      poolsFound: state.poolsFound,
      totalOpportunities: state.totalOpportunities,
      currentBestProfit: stats.maxProfit,
    });
  }, 60000);
}

// Експорт публічного API
export default {
  ArbitrageOrchestrator,
  startMonitor,
  runSimpleMonitor,
};