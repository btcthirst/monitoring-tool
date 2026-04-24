// ui/renderer.ts
/**
 * Рендерер для виводу арбітражних можливостей в консоль.
 *
 * Відповідальність:
 * - Відображення live-оновлюваної таблиці
 * - Форматування з кольорами через formatters.ts
 * - Жодної бізнес-логіки
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
  padVisible,
} from './formatters';
import { formatDuration } from '../utils/time';

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

export interface RenderOptions {
  minProfit: number;
  quoteMint: string;
  pollingIntervalMs: number;
  tradeSize: number;
  showSlippage?: boolean;
  maxOpportunities?: number;
}

// ---------------------------------------------------------------------------
// Головний рендерер
// ---------------------------------------------------------------------------

export class Renderer {
  private renderCount = 0;
  private lastRenderTime = 0;
  private sessionOpportunities = 0;

  /**
   * Головний метод — очищує екран та рендерить повний layout.
   */
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

  /**
   * Екран підключення до RPC.
   */
  renderConnecting(rpcUrl: string): void {
    this.clearScreen();
    console.log(chalk.cyan.bold('\n🔌 Connecting to Solana RPC...'));
    console.log(chalk.gray(`   URL: ${rpcUrl.replace(/\/\/.*@/, '//***@')}`));
    console.log(chalk.gray('   Please wait...\n'));
  }

  /**
   * Повідомлення про успішне підключення.
   */
  renderConnected(poolsFound: number): void {
    console.log(chalk.green.bold('\n✅ Connected successfully'));
    console.log(
      poolsFound >= 2
        ? chalk.green(`   Found ${poolsFound} Raydium CPMM pools — monitoring started`)
        : chalk.yellow(`   Found ${poolsFound} pool (need ≥2 for arbitrage — waiting for more)`),
    );
    console.log();
  }

  /**
   * Вивід помилки (без виходу з програми).
   */
  renderError(error: Error): void {
    this.clearScreen();
    console.log(chalk.red.bold('\n❌ Error occurred'));
    console.log(chalk.red(`   ${error.message}`));
    const stackLine = error.stack?.split('\n')[1]?.trim();
    if (stackLine) console.log(chalk.gray(`   ${stackLine}`));
    console.log(chalk.gray('\n   Monitor will retry on next cycle...\n'));
  }

  // ---------------------------------------------------------------------------
  // Приватні методи
  // ---------------------------------------------------------------------------

  private clearScreen(): void {
    console.clear();
  }

  private renderHeader(options: RenderOptions): void {
    console.log(chalk.bold.cyan('\n🔍 Solana Arbitrage Monitor') + chalk.gray(' — Raydium CPMM'));
    console.log(formatSeparator());
    console.log(
      formatKeyValue('Trade size:', formatTradeSize(options.tradeSize, 'USDC')) + '   ' +
      formatKeyValue('Min profit:', chalk.yellow(formatNumber(options.minProfit, 6))) + '   ' +
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
        chalk.cyan('Buy Pool'),
        chalk.cyan('Sell Pool'),
        chalk.cyan('Net Profit'),
        chalk.cyan('Profit %'),
        chalk.cyan('Gross'),
        chalk.cyan('Slippage'),
        chalk.cyan('Fee'),
      ],
      colWidths: [14, 14, 14, 11, 14, 12, 8],
      style: { head: [], border: [], compact: false },
      chars: {
        top: '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
        bottom: '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
        left: '║', 'left-mid': '╟', mid: '─', 'mid-mid': '┼',
        right: '║', 'right-mid': '╢', middle: '│',
      },
    });

    for (const opp of slice) {
      const avgSlippage = (opp.slippageBuy + opp.slippageSell) / 2;

      table.push([
        chalk.cyan(formatAddress(opp.buyPool.address, 4, 4)),
        chalk.magenta(formatAddress(opp.sellPool.address, 4, 4)),
        formatProfit(opp.netProfit),
        formatPercent(opp.profitPercent, true, 3),
        chalk.white(`${formatNumber(opp.grossProfit, 6)} USDC`),
        formatSlippage(avgSlippage),
        formatFee(opp.buyPool.fee),
      ]);
    }

    console.log(table.toString());

    if (opportunities.length > maxDisplay) {
      console.log(
        chalk.gray(`\n  ... and ${opportunities.length - maxDisplay} more (adjust --min-profit to filter)`),
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
      `  ${formatKeyValue('Amount in:', chalk.white(formatNumber(opp.amountIn, 2) + ' USDC'), 12)}` +
      `  ${formatKeyValue('Amount out:', chalk.white(formatNumber(opp.amountOut, 6) + ' USDC'), 12)}`,
    );
    console.log(
      `  ${formatKeyValue('Gross:', chalk.white(formatNumber(opp.grossProfit, 6) + ' USDC'), 12)}` +
      `  ${formatKeyValue('Tx cost:', chalk.gray(formatNumber(opp.txCost, 6) + ' USDC'), 12)}`,
    );
    console.log(
      `  ${formatKeyValue('Net profit:', chalk.green.bold(formatNumber(opp.netProfit, 6) + ' USDC'), 12)}` +
      `  ${formatKeyValue('Profit %:', formatPercent(opp.profitPercent, true, 4), 12)}`,
    );
    console.log(
      `  ${formatKeyValue('Slip buy:', formatSlippage(opp.slippageBuy), 12)}` +
      `  ${formatKeyValue('Slip sell:', formatSlippage(opp.slippageSell), 12)}`,
    );
  }

  private renderEmpty(): void {
    console.log(chalk.yellow('\n  ⏳ No profitable opportunities found'));
    console.log(chalk.gray('     Waiting for price discrepancies across pools...'));
    console.log(chalk.gray('     Try lowering --min-profit or increasing --trade-size'));
  }

  private renderFooter(opportunities: Opportunity[], options: RenderOptions): void {
    console.log(formatSeparator());

    const now = new Date().toLocaleTimeString();
    const sinceLastRender = this.lastRenderTime
      ? formatRelativeTime(this.lastRenderTime)
      : '—';

    console.log(
      chalk.gray(`  Updated: ${chalk.white(now)}`) +
      chalk.gray(`   Last cycle: ${sinceLastRender}`) +
      chalk.gray(`   Renders: ${this.renderCount}`) +
      chalk.gray(`   Session opps: ${chalk.green(String(this.sessionOpportunities))}`),
    );

    console.log(chalk.gray(
      `\n  Legend: ${chalk.cyan('buy pool')}  ${chalk.magenta('sell pool')}` +
      `  ${chalk.green('profit > 0')}  ${chalk.yellow('slippage warn')}  ${chalk.red('high slippage')}`,
    ));
    console.log(chalk.gray(`\n  Press ${chalk.white('Ctrl+C')} to exit`));
  }
}

// ---------------------------------------------------------------------------
// Спрощений рендерер (один рядок, без очищення екрану)
// ---------------------------------------------------------------------------

/**
 * SimpleRenderer — для quiet режиму або редиректу stdout у файл.
 * Активується через --simple флаг (майбутня функція).
 */
export class SimpleRenderer {
  render(opportunities: Opportunity[], options: RenderOptions): void {
    const time = new Date().toLocaleTimeString();

    if (opportunities.length === 0) {
      process.stdout.write(`\r⏳ No opportunities | ${time}     `);
      return;
    }

    const best = opportunities[0]!;
    process.stdout.write(
      `\r💰 Best: ${formatNumber(best.netProfit, 6)} USDC` +
      ` (${best.profitPercent.toFixed(3)}%)` +
      ` | buy: ${formatAddress(best.buyPool.address)}` +
      ` sell: ${formatAddress(best.sellPool.address)}` +
      ` | ${time}     `,
    );
  }
}