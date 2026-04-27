#!/usr/bin/env node
// src/index.ts

import { Command } from 'commander';
import { logger } from './logger/logger';
import { loadConfig, Config } from './config';

const program = new Command();

program
  .name('solana-arbitrage-monitor')
  .description('Real-time arbitrage monitoring for Raydium CPMM pools')
  .version((() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../package.json').version as string;
    } catch {
      return '1.0.0';
    }
  })());

program
  .command('monitor [mintA] [mintB]')
  .description('Start monitoring arbitrage opportunities')
  .option('--mint-a <address>', 'Token A mint address')
  .option('--mint-b <address>', 'Token B mint address')
  .option('--rpc <url>', 'Solana RPC URL')
  .option('--quote <address>', 'Quote token mint address (default: mint-b)')
  .option('--interval <ms>', 'Polling interval in ms (min: 500)', (v) => parseInt(v, 10))
  .option('--min-profit <number>', 'Minimum net profit threshold', (v) => parseFloat(v))
  .option('--trade-size <number>', 'Simulated trade size', (v) => parseFloat(v))
  .option('--max-slippage <number>', 'Max allowed slippage per swap leg as a decimal (e.g. 0.05 = 5%)', (v) => parseFloat(v))
  .option('--log-level <level>', 'Log level (error|warn|info|debug)')
  .action(async (positionalMintA, positionalMintB, options) => {
    try {
      // Map CLI options to Config keys
      const cliOverrides: Partial<Config> = {
        rpcUrl: options.rpc,
        mintA: positionalMintA || options.mintA,
        mintB: positionalMintB || options.mintB,
        quoteMint: options.quote,
        pollingIntervalMs: options.interval,
        minProfitThreshold: options.minProfit,
        tradeSize: options.tradeSize,
        maxSlippagePercent: options.maxSlippage,
        logLevel: options.logLevel,
      };

      // Filter out undefined to allow .env/defaults to take over
      const cleanOverrides = Object.fromEntries(
        Object.entries(cliOverrides).filter(([, v]) => v !== undefined)
      );

      // Centralized loading and validation
      const finalConfig = loadConfig(cleanOverrides);

      // Lazy import — speeds up --help and argument validation
      const { startMonitor } = await import('./core/orchestrator');

      logger.info('Starting arbitrage monitor', {
        rpcUrl: finalConfig.rpcUrl.replace(/\/\/.*@/, '//***@'),
        mintA: finalConfig.mintA,
        mintB: finalConfig.mintB,
        quoteMint: finalConfig.quoteMint,
        intervalMs: finalConfig.pollingIntervalMs,
        minProfit: finalConfig.minProfitThreshold,
        tradeSize: finalConfig.tradeSize,
        maxSlippagePercent: finalConfig.maxSlippagePercent,
      });

      await startMonitor(finalConfig);
    } catch (error) {
      logger.error('Startup failed', { error: (error as Error).message });
      process.exit(1);
    }
  });

// Show help if no command is provided
if (process.argv.length < 3) {
  program.help();
}

program.parse(process.argv);