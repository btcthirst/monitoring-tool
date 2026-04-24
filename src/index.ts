#!/usr/bin/env node
// src/index.ts

import { Command } from 'commander';
import { config } from 'dotenv';
import { logger } from './logger/logger';

// Завантаження змінних оточення
config();

// Ініціалізація CLI
const program = new Command();

program
  .name('solana-arbitrage-monitor')
  .description('Real-time arbitrage monitoring for Raydium CPMM pools')
  .version('1.0.0');

program
  .command('monitor')
  .description('Start monitoring arbitrage opportunities')
  .option('--rpc <url>', 'Solana RPC URL', process.env.RPC_URL)
  .option('--mint-a <address>', 'Token A mint address', process.env.DEFAULT_MINT_A)
  .option('--mint-b <address>', 'Token B mint address', process.env.DEFAULT_MINT_B)
  .option('--quote <address>', 'Quote token mint address', process.env.DEFAULT_QUOTE_MINT)
  .option('--interval <ms>', 'Polling interval in ms', parseInt(process.env.POLLING_INTERVAL_MS || '2000'))
  .option('--min-profit <number>', 'Minimum profit threshold', parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.01'))
  .option('--trade-size <number>', 'Trade size in quote token', parseFloat(process.env.TRADE_SIZE || '100'))
  .option('--log-level <level>', 'Log level', process.env.LOG_LEVEL || 'info')
  .action(async (options) => {
    // Імпортуємо тільки коли потрібно (для швидшого старту)
    const { startMonitor } = await import('./core/orchestrator');
    
    logger.info('Starting arbitrage monitor', {
      rpcUrl: options.rpc,
      mintA: options.mintA,
      mintB: options.mintB,
      intervalMs: options.interval,
      minProfit: options.minProfit,
    });
    
    await startMonitor({
      rpcUrl: options.rpc,
      mintA: options.mintA,
      mintB: options.mintB,
      quoteMint: options.quote,
      pollingIntervalMs: options.interval,
      minProfitThreshold: options.minProfit,
      tradeSize: options.tradeSize,
      logLevel: options.logLevel,
    });
  });

program.parse(process.argv);