// ui/renderer.ts
/**
 * Renderer for outputting arbitrage opportunities to the console.
 *
 * Improvements:
 * - ANSI-safe column alignment
 * - Deterministic layout (no floating columns)
 * - Fixed-width formatting for numbers
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import { Opportunity } from '../core/types';
import {
  formatAddress,
  formatNumber,
  formatProfit,
  formatPercent,
  formatSlippage,
  formatFee,
  formatTradeSize,
  formatSeparator,
  formatKeyValue,
  formatRelativeTime,
  formatCurrency,
  formatSpotPrice,
  visibleLength,
} from './formatters';
import { formatDuration } from '../utils/time';

// ---------------------------------------------------------------------------
// Column widths (single source of truth)
// ---------------------------------------------------------------------------

const COL_WIDTHS = {
  buy: 16,
  sell: 16,
  profit: 16,
  percent: 12,
  price: 16,
  spread: 12,
  slippage: 12,
  fee: 10,
};

// ---------------------------------------------------------------------------
// ANSI-safe helpers
// ---------------------------------------------------------------------------

function padAnsi(str: string, width: number): string {
  const len = visibleLength(str);
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
}

function truncateAnsi(str: string, width: number): string {
  if (visibleLength(str) <= width) return str;

  // crude but safe fallback (avoid breaking ANSI)
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  return clean.slice(0, width - 1) + '…';
}

function fit(str: string, width: number): string {
  return padAnsi(truncateAnsi(str, width), width);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderOptions {
  minProfit: number;
  quoteMint: string;
  quoteSymbol: string;
  pollingIntervalMs: number;
  tradeSize: number;
  showSlippage?: boolean;
  maxOpportunities?: number;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  private renderCount = 0;
  private lastRenderTime = 0;
  private sessionOpportunities = 0;

  render(opportunities: Opportunity[], options: RenderOptions): void {
    this.clearScreen();
    this.renderHeader(options);
    this.renderTable(opportunities, options);
    this.renderTopDetail(opportunities[0], options);
    this.renderFooter(opportunities, options);

    this.sessionOpportunities += opportunities.length;
    this.lastRenderTime = Date.now();
    this.renderCount++;
  }

  renderConnecting(rpcUrl: string): void {
    this.clearScreen();
    console.log(chalk.cyan.bold('\n🔌 Connecting to Solana RPC...'));
    console.log(chalk.gray(`   URL: ${rpcUrl.replace(/\/\/.*@/, '//***@')}`));
    console.log(chalk.gray('   Please wait...\n'));
  }

  renderConnected(poolsFound: number): void {
    console.log(chalk.green.bold('\n✅ Connected successfully'));
    console.log(
      poolsFound >= 2
        ? chalk.green(`   Found ${poolsFound} Raydium CPMM pools — monitoring started`)
        : chalk.yellow(`   Found ${poolsFound} pool (need >=2 for arbitrage — waiting for more)`),
    );
    console.log();
  }

  renderError(error: Error): void {
    this.clearScreen();
    console.log(chalk.red.bold('\n❌ Error occurred'));
    console.log(chalk.red(`   ${error.message}`));
    const stackLine = error.stack?.split('\n')[1]?.trim();
    if (stackLine) console.log(chalk.gray(`   ${stackLine}`));
    console.log(chalk.gray('\n   Monitor will retry on next cycle...\n'));
  }

  // ---------------------------------------------------------------------------

  private clearScreen(): void {
    console.clear();
  }

  private renderHeader(options: RenderOptions): void {
    console.log(chalk.bold.cyan('\n🔍 Solana Arbitrage Monitor') + chalk.gray(' — Raydium CPMM'));
    console.log(formatSeparator());

    console.log(
      formatKeyValue('Trade size:', formatTradeSize(options.tradeSize, options.quoteSymbol)) + '   ' +
      formatKeyValue('Min profit:', chalk.yellow(`${formatNumber(options.minProfit, 6)} ${options.quoteSymbol}`)) + '   ' +
      formatKeyValue('Interval:', chalk.yellow(formatDuration(options.pollingIntervalMs))),
    );

    console.log(formatSeparator());
  }

  private renderTable(opportunities: Opportunity[], options: RenderOptions): void {
    const maxDisplay = options.maxOpportunities ?? 15;
    const slice = opportunities.slice(0, maxDisplay);

    if (slice.length === 0) {
      this.renderEmpty();
      return;
    }

    const table = new Table({
      head: [
        fit(chalk.cyan('Buy Pool'), COL_WIDTHS.buy),
        fit(chalk.cyan('Sell Pool'), COL_WIDTHS.sell),
        fit(chalk.cyan('Net Profit'), COL_WIDTHS.profit),
        fit(chalk.cyan('Profit %'), COL_WIDTHS.percent),
        fit(chalk.cyan('Price (buy)'), COL_WIDTHS.price),
        fit(chalk.cyan('Spread'), COL_WIDTHS.spread),
        fit(chalk.cyan('Slippage'), COL_WIDTHS.slippage),
        fit(chalk.cyan('Fee'), COL_WIDTHS.fee),
      ],
      wordWrap: false,
      style: { head: [], border: [] },
    });

    for (const opp of slice) {
      const avgSlippage = (opp.slippageBuy + opp.slippageSell) / 2;

      const buy = fit(
        chalk.cyan(formatAddress(opp.buyPool.address, 4, 4)),
        COL_WIDTHS.buy,
      );

      const sell = fit(
        chalk.magenta(formatAddress(opp.sellPool.address, 4, 4)),
        COL_WIDTHS.sell,
      );

      const profit = fit(
        formatProfit(opp.netProfit),
        COL_WIDTHS.profit,
      );

      const percent = fit(
        formatPercent(opp.profitPercent, true, 3),
        COL_WIDTHS.percent,
      );

      const price = fit(
        formatSpotPrice(opp.spotPriceBuy, options.quoteSymbol),
        COL_WIDTHS.price,
      );

      const spread = fit(
        formatPercent(opp.priceSpreadPercent, true, 3),
        COL_WIDTHS.spread,
      );

      const slip = fit(
        formatSlippage(avgSlippage),
        COL_WIDTHS.slippage,
      );

      const fee = fit(
        formatFee(opp.buyPool.fee),
        COL_WIDTHS.fee,
      );

      table.push([buy, sell, profit, percent, price, spread, slip, fee]);
    }

    console.log(table.toString());

    if (opportunities.length > maxDisplay) {
      console.log(
        chalk.gray(`\n  ... and ${opportunities.length - maxDisplay} more`),
      );
    }
  }

  private renderTopDetail(opp: Opportunity | undefined, options: RenderOptions): void {
    if (!opp) return;

    console.log(chalk.white('\n📊 Best Opportunity:'));
    console.log(formatSeparator('─'));

    console.log(
      chalk.cyan('  Buy  ') + chalk.gray(opp.buyPool.address) +
      chalk.gray(`  fee: ${(opp.buyPool.fee * 100).toFixed(2)}%`),
    );

    console.log(
      chalk.magenta('  Sell ') + chalk.gray(opp.sellPool.address) +
      chalk.gray(`  fee: ${(opp.sellPool.fee * 100).toFixed(2)}%`),
    );

    console.log(formatSeparator('─'));

    console.log(
      `  ${formatKeyValue('Buy price:', formatSpotPrice(opp.spotPriceBuy, options.quoteSymbol), 12)}` +
      `  ${formatKeyValue('Sell price:', formatSpotPrice(opp.spotPriceSell, options.quoteSymbol), 12)}`,
    );

    console.log(
      `  ${formatKeyValue('Price spread:', formatPercent(opp.priceSpreadPercent, true, 4), 12)}` +
      `  ${formatKeyValue('Buy TVL:', chalk.gray(formatCurrency(opp.buyPool.tvl, options.quoteSymbol, 0)), 12)}`,
    );

    console.log(formatSeparator('─'));

    console.log(
      `  ${formatKeyValue('Amount in:', chalk.white(formatCurrency(opp.amountIn, options.quoteSymbol, 2)), 12)}` +
      `  ${formatKeyValue('Amount out:', chalk.white(formatCurrency(opp.amountOut, options.quoteSymbol, 6)), 12)}`,
    );

    console.log(
      `  ${formatKeyValue('Net profit:', chalk.green.bold(formatCurrency(opp.netProfit, options.quoteSymbol, 6)), 12)}` +
      `  ${formatKeyValue('Profit %:', formatPercent(opp.profitPercent, true, 4), 12)}`,
    );
  }

  private renderEmpty(): void {
    console.log(chalk.yellow('\n  ⏳ No profitable opportunities found'));
    console.log(chalk.gray('     Waiting for price discrepancies...'));
  }

  private renderFooter(opportunities: Opportunity[], options: RenderOptions): void {
    console.log(formatSeparator());

    const now = new Date().toLocaleTimeString();
    const sinceLastRender = this.lastRenderTime
      ? formatRelativeTime(this.lastRenderTime)
      : '—';

    console.log(
      chalk.gray(`  Updated: ${chalk.white(now)}`) +
      chalk.gray(`   Last: ${sinceLastRender}`) +
      chalk.gray(`   Renders: ${this.renderCount}`) +
      chalk.gray(`   Opps: ${chalk.green(String(this.sessionOpportunities))}`),
    );

    console.log(chalk.gray(`\n  Press ${chalk.white('Ctrl+C')} to exit`));
  }
}