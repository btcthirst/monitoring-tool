// core/orchestrator.ts
/**
 * Main orchestrator for monitoring arbitrage opportunities.
 *
 * Coordinates:
 * - Pool discovery via Raydium SDK
 * - Polling loop with reserve updates
 * - Search for arbitrage opportunities
 * - Rendering results
 */

import { SolanaRpcClient } from '../solana/client';
import { findPoolsForPair, refreshPoolReserves } from '../solana/poolDiscovery';
import { findArbitrageOpportunities, getTopOpportunities, getOpportunityStats } from './arbitrage';
import { RawPool, ArbitrageConfig, Opportunity } from './types';
import { Renderer } from '../ui/renderer';
import { logger, setLogLevel, logError, logOpportunity } from '../logger/logger';
import { PerformanceTimer, PeriodicExecutor } from '../utils/time';
import { resolveSymbol } from '../ui/formatters';
import { formatNumber } from '../utils/math';
import { Config } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestratorConfig = Config;

interface MonitoringState {
  isRunning: boolean;
  poolsFound: number;
  lastUpdateTime: number;
  totalUpdates: number;
  totalOpportunities: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class ArbitrageOrchestrator {
  private readonly rpcClient: SolanaRpcClient;
  private readonly renderer: Renderer;
  private readonly config: ArbitrageConfig;
  private readonly mintA: string;
  private readonly mintB: string;
  private readonly pollingIntervalMs: number;
  private readonly quoteSymbol: string;

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
    this.mintA = config.mintA;
    this.mintB = config.mintB;
    this.pollingIntervalMs = config.pollingIntervalMs;

    this.config = {
      tradeSize: config.tradeSize,
      minProfit: config.minProfitThreshold,
      maxSlippage: config.maxSlippagePercent,
      txCostInQuote: config.txCostInQuote,
      quoteMint: config.quoteMint!,
    };
    this.quoteSymbol = resolveSymbol(config.quoteMint!);

    this.rpcClient = new SolanaRpcClient(config.rpcUrl);
    this.renderer = new Renderer();

    setLogLevel(config.logLevel);

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

    this.state.isRunning = true;
    this.renderer.renderConnecting(this.rpcClient.getRpcUrl());

    const discovered = await this.discoverPools();
    if (!discovered) {
      logger.error('Pool discovery failed, cannot start monitoring');
      this.state.isRunning = false;
      return;
    }

    this.renderer.renderConnected(this.state.poolsFound);

    this.executor = new PeriodicExecutor(
      () => this.updateCycle(),
      this.pollingIntervalMs,
      (error) => this.handleUpdateError(error),
    );

    this.executor.start();
    logger.info('Monitoring started', { pools: this.state.poolsFound });
  }

  stop(): void {
    if (!this.state.isRunning) return;

    this.state.isRunning = false;
    this.executor?.stop();
    this.executor = null;

    logger.info('Monitoring stopped', {
      totalUpdates: this.state.totalUpdates,
      totalOpportunities: this.state.totalOpportunities,
    });
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  private async discoverPools(): Promise<boolean> {
    const timer = new PerformanceTimer('PoolDiscovery');

    try {
      logger.info('Discovering pools...', { mintA: this.mintA, mintB: this.mintB });

      this.rawPools = await findPoolsForPair(
        this.rpcClient,
        this.mintA,
        this.mintB,
        false, // no cache on start
      );

      if (this.rawPools.length === 0) {
        logger.error('No pools found for token pair', {
          mintA: this.mintA,
          mintB: this.mintB,
        });
        return false;
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
      const err = error as Error;
      logError(err, 'discoverPools');

      if (err.message.toLowerCase().includes('fetch failed') || err.message.includes('403')) {
        logger.warn(
          'Public RPC endpoints often block getProgramAccounts or complex filters. ' +
          'It is highly recommended to use a private RPC provider (Helius, QuickNode, Alchemy).',
        );
      }

      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Main cycle
  // ---------------------------------------------------------------------------

  private async updateCycle(): Promise<void> {
    const timer = new PerformanceTimer('UpdateCycle');

    const healthy = await this.rpcClient.healthCheck();
    if (!healthy) {
      logger.warn('RPC health check failed, skipping cycle');
      return;
    }

    // Delegate reserve refresh entirely to poolDiscovery layer.
    // refreshPoolReserves handles: decode → vault fetch → assemble,
    // and falls back to full re-discovery if all pools have disappeared.
    const updatedPools = await refreshPoolReserves(
      this.rawPools,
      this.rpcClient,
      this.mintA,
      this.mintB,
    );

    if (updatedPools.length === 0) {
      logger.warn('No pools available after refresh, skipping arbitrage search');
      return;
    }

    this.rawPools = updatedPools;
    this.state.poolsFound = updatedPools.length;

    if (this.rawPools.length < 2) {
      logger.warn('Less than 2 pools available, skipping arbitrage search');
      return;
    }

    const opportunities = findArbitrageOpportunities(this.rawPools, this.config);
    const topOpps = getTopOpportunities(opportunities, 15);

    this.lastOpportunities = topOpps;
    this.state.totalUpdates++;
    this.state.totalOpportunities += opportunities.length;
    this.state.lastUpdateTime = Date.now();

    this.renderer.render(topOpps, {
      minProfit: this.config.minProfit,
      quoteMint: this.config.quoteMint,
      quoteSymbol: this.quoteSymbol,
      pollingIntervalMs: this.pollingIntervalMs,
      tradeSize: this.config.tradeSize,
    });

    const best = opportunities[0];
    if (best) {
      logOpportunity(
        best.netProfit,
        best.profitPercent,
        best.buyPool.address,
        best.sellPool.address,
      );
    }

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
  // Error handling
  // ---------------------------------------------------------------------------

  private handleUpdateError(error: Error): void {
    this.state.lastError = error.message;
    logError(error, 'updateCycle');
    this.renderer.renderError(error);

    if (error.message.includes('RPC call failed')) {
      logger.warn('RPC error — will re-discover pools on next cycle');
      this.rawPools = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Public state
  // ---------------------------------------------------------------------------

  getState(): Readonly<MonitoringState> {
    return { ...this.state };
  }

  getLastOpportunities(): Opportunity[] {
    return [...this.lastOpportunities];
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export async function startMonitor(
  config: OrchestratorConfig,
): Promise<ArbitrageOrchestrator> {
  const orchestrator = new ArbitrageOrchestrator(config);

  process.once('SIGINT', () => {
    logger.info('Received SIGINT, stopping...');
    orchestrator.stop();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    logger.info('Received SIGTERM, stopping...');
    orchestrator.stop();
    process.exit(0);
  });

  await orchestrator.start();
  return orchestrator;
}