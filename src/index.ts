#!/usr/bin/env node
// src/index.ts

import { Command } from 'commander';
import { config } from 'dotenv';
import { logger } from './logger/logger';

config();

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
  .command('monitor')
  .description('Start monitoring arbitrage opportunities')
  .requiredOption('--mint-a <address>', 'Token A mint address', process.env.MINT_A)
  .requiredOption('--mint-b <address>', 'Token B mint address', process.env.MINT_B)
  .option('--rpc <url>', 'Solana RPC URL', process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com')
  .option('--quote <address>', 'Quote token mint address (default: mint-b)', process.env.QUOTE_MINT)
  .option(
    '--interval <ms>',
    'Polling interval in ms (min: 500)',
    (v: string) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 500) throw new Error('--interval must be a number >= 500');
      return n;
    },
    parseInt(process.env.POLLING_INTERVAL_MS ?? '2000', 10),
  )
  .option(
    '--min-profit <number>',
    'Minimum net profit threshold in quote token',
    (v: string) => {
      const n = parseFloat(v);
      if (isNaN(n) || n < 0) throw new Error('--min-profit must be a non-negative number');
      return n;
    },
    parseFloat(process.env.MIN_PROFIT_THRESHOLD ?? '0.01'),
  )
  .option(
    '--trade-size <number>',
    'Simulated trade size in quote token',
    (v: string) => {
      const n = parseFloat(v);
      if (isNaN(n) || n <= 0) throw new Error('--trade-size must be a positive number');
      return n;
    },
    parseFloat(process.env.TRADE_SIZE ?? '100'),
  )
  .option('--log-level <level>', 'Log level (error|warn|info|debug)', process.env.LOG_LEVEL ?? 'info')
  .action(async (options) => {
    // Lazy import — прискорює --help та валідацію аргументів
    const { startMonitor } = await import('./core/orchestrator');

    logger.info('Starting arbitrage monitor', {
      rpcUrl: options.rpc.replace(/\/\/.*@/, '//***@'),
      mintA: options.mintA,
      mintB: options.mintB,
      quoteMint: options.quote ?? options.mintB,
      intervalMs: options.interval,
      minProfit: options.minProfit,
      tradeSize: options.tradeSize,
    });

    await startMonitor({
      rpcUrl: options.rpc,
      mintA: options.mintA,
      mintB: options.mintB,
      quoteMint: options.quote ?? options.mintB,
      pollingIntervalMs: options.interval,
      minProfitThreshold: options.minProfit,
      tradeSize: options.tradeSize,
      maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT ?? '0.05'),
      txCostInQuote: parseFloat(process.env.TX_COST_IN_QUOTE ?? '0.0002'),
      logLevel: options.logLevel,
    });
  });

// Показуємо help якщо не передано жодної команди
if (process.argv.length < 3) {
  program.help();
}

program.parse(process.argv);