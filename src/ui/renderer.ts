// ui/renderer.ts
/**
 * Рендерер для виводу даних в консоль
 * 
 * Відповідальність:
 * - Відображення таблиць з арбітражними можливостями
 * - Форматування виводу з кольорами
 * - Оновлення екрану в реальному часі
 * 
 * ВАЖЛИВО:
 * - Не містить бізнес-логіки
 * - Тільки візуалізація даних
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import { Opportunity } from '../core/types';
import { formatAddress, formatPrice, formatProfit, formatPercent, formatNumber } from './formatters';
import { formatDuration } from '../utils/time';

/**
 * Опції рендерера
 */
export interface RenderOptions {
  minProfit: number;
  quoteMint: string;
  pollingIntervalMs: number;
  tradeSize: number;
  showSlippage?: boolean;
  maxOpportunities?: number;
}

/**
 * Статистика для виводу
 */
interface RenderStats {
  totalOpportunities: number;
  totalPools?: number;
  lastUpdateTime: number;
  cycleTimeMs?: number;
  rpcCalls?: number;
}

/**
 * Головний клас рендерера
 */
export class Renderer {
  private lastRenderTime: number = 0;
  private renderCount: number = 0;
  private opportunitiesHistory: Opportunity[][] = [];

  constructor() {
    // Встановлюємо кодування для правильної роботи з Unicode
    process.stdout.setDefaultEncoding?.('utf-8');
  }

  /**
   * Основний метод рендерингу
   */
  render(opportunities: Opportunity[], options: RenderOptions, stats?: RenderStats): void {
    // Зберігаємо в історію
    this.opportunitiesHistory.push(opportunities);
    if (this.opportunitiesHistory.length > 10) {
      this.opportunitiesHistory.shift();
    }

    // Очищення екрану
    this.clearScreen();

    // Вивід хедера
    this.renderHeader(options);

    // Вивід статистики (якщо є)
    if (stats) {
      this.renderStats(stats);
    }

    // Вивід таблиці з можливостями
    this.renderOpportunitiesTable(opportunities, options);

    // Вивід футера
    this.renderFooter(opportunities, options);

    this.lastRenderTime = Date.now();
    this.renderCount++;
  }

  /**
   * Очищення екрану
   */
  private clearScreen(): void {
    // Очищення терміналу та переміщення курсору вгору
    console.clear();
    // Альтернативний спосіб (для сумісності)
    // process.stdout.write('\x1b[2J\x1b[0f');
  }

  /**
   * Вивід хедера з інформацією про моніторинг
   */
  private renderHeader(options: RenderOptions): void {
    const title = chalk.bold.cyan('\n🔍 Solana Arbitrage Monitor - Raydium CPMM');
    const version = chalk.gray(' v1.0.0');
    
    console.log(title + version);
    console.log(chalk.gray('═'.repeat(80)));
    
    // Інформація про конфігурацію
    console.log(chalk.white('📊 Config:'));
    console.log(chalk.gray(`   Trade Size:     ${chalk.yellow(formatNumber(options.tradeSize))} ${options.quoteMint}`));
    console.log(chalk.gray(`   Min Profit:     ${chalk.yellow(formatNumber(options.minProfit))} ${options.quoteMint}`));
    console.log(chalk.gray(`   Polling:        ${chalk.yellow(formatDuration(options.pollingIntervalMs))}`));
    
    if (options.showSlippage) {
      console.log(chalk.gray(`   Max Slippage:   ${chalk.yellow('<5%')}`));
    }
    
    console.log(chalk.gray('═'.repeat(80)));
  }

  /**
   * Вивід статистики роботи
   */
  private renderStats(stats: RenderStats): void {
    console.log(chalk.white('📈 Stats:'));
    console.log(chalk.gray(`   Opportunities:  ${chalk.green(stats.totalOpportunities.toString())}`));
    
    if (stats.totalPools) {
      console.log(chalk.gray(`   Pools:          ${chalk.cyan(stats.totalPools.toString())}`));
    }
    
    if (stats.cycleTimeMs) {
      const color = stats.cycleTimeMs > 1000 ? chalk.yellow : chalk.green;
      console.log(chalk.gray(`   Cycle Time:     ${color(formatDuration(stats.cycleTimeMs))}`));
    }
    
    if (stats.rpcCalls) {
      console.log(chalk.gray(`   RPC Calls:      ${chalk.magenta(stats.rpcCalls.toString())}`));
    }
    
    console.log(chalk.gray('═'.repeat(80)));
  }

  /**
   * Вивід таблиці з арбітражними можливостями
   */
  private renderOpportunitiesTable(opportunities: Opportunity[], options: RenderOptions): void {
    if (opportunities.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Обмеження кількості виведених можливостей
    const maxDisplay = options.maxOpportunities || 15;
    const displayOpportunities = opportunities.slice(0, maxDisplay);
    const hasMore = opportunities.length > maxDisplay;

    // Створення таблиці
    const table = new Table({
      head: [
        chalk.cyan('Buy Pool'),
        chalk.cyan('Sell Pool'),
        chalk.cyan('Net Profit'),
        chalk.cyan('Profit %'),
        chalk.cyan('Gross'),
        chalk.cyan('Slippage'),
      ],
      colWidths: [28, 28, 14, 10, 12, 12],
      style: {
        head: [],
        border: [],
        compact: false,
      },
      chars: {
        top: '═',
        'top-mid': '╤',
        'top-left': '╔',
        'top-right': '╗',
        bottom: '═',
        'bottom-mid': '╧',
        'bottom-left': '╚',
        'bottom-right': '╝',
        left: '║',
        'left-mid': '╟',
        mid: '─',
        'mid-mid': '┼',
        right: '║',
        'right-mid': '╢',
        middle: '│',
      },
    });

    // Додавання рядків
    for (const opp of displayOpportunities) {
      const isProfitable = opp.netProfit > 0;
      
      table.push([
        this.formatPoolCell(opp.buyPool.address, opp.buyPool.tokenA, opp.buyPool.tokenB),
        this.formatPoolCell(opp.sellPool.address, opp.sellPool.tokenA, opp.sellPool.tokenB, true),
        formatProfit(opp.netProfit, opp.netProfit > options.minProfit),
        formatPercent(opp.profitPercent, opp.profitPercent > 0.5),
        `${formatNumber(opp.grossProfit)} ${options.quoteMint}`,
        this.formatSlippageCell(opp.slippageBuy, opp.slippageSell),
      ]);
    }

    console.log(table.toString());

    // Інформація про додаткові можливості
    if (hasMore) {
      const remaining = opportunities.length - maxDisplay;
      console.log(chalk.gray(`\n   ... and ${remaining} more opportunities (use --limit to see more)`));
    }

    // Топ можливість з деталями
    if (opportunities.length > 0 && opportunities[0]) {
      this.renderTopOpportunityDetail(opportunities[0], options);
    }
  }

  /**
   * Форматування комірки з пулом
   */
  private formatPoolCell(address: string, tokenA: string, tokenB: string, isSell: boolean = false): string {
    const shortAddress = formatAddress(address);
    const direction = isSell ? '→' : '←';
    const color = isSell ? chalk.magenta : chalk.cyan;
    
    return color(`${shortAddress}\n${chalk.gray(`${tokenA.slice(0, 4)} ${direction} ${tokenB.slice(0, 4)}`)}`);
  }

  /**
   * Форматування комірки з прослизанням
   */
  private formatSlippageCell(slippageBuy: number, slippageSell: number): string {
    const avgSlippage = (Math.abs(slippageBuy) + Math.abs(slippageSell)) / 2;
    const slippagePercent = avgSlippage * 100;
    
    let color = chalk.green;
    let indicator = '✓';
    
    if (slippagePercent > 3) {
      color = chalk.red;
      indicator = '⚠';
    } else if (slippagePercent > 1) {
      color = chalk.yellow;
      indicator = '!';
    }
    
    return color(`${indicator} ${slippagePercent.toFixed(2)}%`);
  }

  /**
   * Детальна інформація про топ можливість
   */
  private renderTopOpportunityDetail(opportunity: Opportunity, options: RenderOptions): void {
    console.log(chalk.white('\n📊 Top Opportunity Details:'));
    console.log(chalk.gray('─'.repeat(80)));
    
    // Buy pool details
    console.log(chalk.cyan('  Buy Pool:'));
    console.log(chalk.gray(`    Address:   ${opportunity.buyPool.address}`));
    console.log(chalk.gray(`    Tokens:    ${opportunity.buyPool.tokenA.slice(0, 8)}... / ${opportunity.buyPool.tokenB.slice(0, 8)}...`));
    console.log(chalk.gray(`    Reserves:  ${formatNumber(opportunity.buyPool.reserveA)} / ${formatNumber(opportunity.buyPool.reserveB)}`));
    console.log(chalk.gray(`    Fee:       ${(opportunity.buyPool.fee * 100).toFixed(2)}%`));
    
    // Sell pool details
    console.log(chalk.magenta('  Sell Pool:'));
    console.log(chalk.gray(`    Address:   ${opportunity.sellPool.address}`));
    console.log(chalk.gray(`    Tokens:    ${opportunity.sellPool.tokenA.slice(0, 8)}... / ${opportunity.sellPool.tokenB.slice(0, 8)}...`));
    console.log(chalk.gray(`    Reserves:  ${formatNumber(opportunity.sellPool.reserveA)} / ${formatNumber(opportunity.sellPool.reserveB)}`));
    console.log(chalk.gray(`    Fee:       ${(opportunity.sellPool.fee * 100).toFixed(2)}%`));
    
    // Profit analysis
    console.log(chalk.green('  Profit Analysis:'));
    console.log(chalk.gray(`    Amount In:   ${formatNumber(opportunity.amountIn)} ${options.quoteMint}`));
    console.log(chalk.gray(`    Amount Out:  ${formatNumber(opportunity.amountOut)} ${options.quoteMint}`));
    console.log(chalk.gray(`    Gross:       ${formatNumber(opportunity.grossProfit)} ${options.quoteMint}`));
    console.log(chalk.gray(`    Tx Cost:     ${formatNumber(opportunity.txCost)} ${options.quoteMint}`));
    console.log(chalk.green(`    Net Profit:  ${formatNumber(opportunity.netProfit)} ${options.quoteMint} (${opportunity.profitPercent.toFixed(2)}%)`));
    
    // Slippage
    console.log(chalk.yellow('  Slippage:'));
    console.log(chalk.gray(`    Buy Pool:    ${(opportunity.slippageBuy * 100).toFixed(4)}%`));
    console.log(chalk.gray(`    Sell Pool:   ${(opportunity.slippageSell * 100).toFixed(4)}%`));
  }

  /**
   * Вивід порожнього стану (немає можливостей)
   */
  private renderEmptyState(): void {
    console.log(chalk.yellow('\n  ⏳ No profitable opportunities found yet...'));
    console.log(chalk.gray('     Waiting for price discrepancies across pools'));
    console.log(chalk.gray('     Adjust min-profit threshold or increase trade size'));
  }

  /**
   * Вивід футера
   */
  private renderFooter(opportunities: Opportunity[], options: RenderOptions): void {
    console.log(chalk.gray('\n═'.repeat(80)));
    
    // Час останнього оновлення
    const lastUpdate = formatDuration(Date.now() - this.lastRenderTime);
    console.log(chalk.gray(`   Last update:  ${new Date().toLocaleTimeString()} (${lastUpdate} ago)`));
    
    // Загальна кількість знайдених можливостей за сесію
    const totalFound = this.opportunitiesHistory.reduce((sum, opps) => sum + opps.length, 0);
    if (totalFound > 0) {
      console.log(chalk.gray(`   Total found:  ${chalk.green(totalFound.toString())} opportunities`));
    }
    
    // Інформація про рендер
    console.log(chalk.gray(`   Renders:      ${this.renderCount}`));
    
    // Легенда
    console.log(chalk.gray('\n  Legend:'));
    console.log(chalk.gray(`    ${chalk.cyan('←')} Buy pool   ${chalk.magenta('→')} Sell pool   ${chalk.green('✓')} Low slippage   ${chalk.yellow('!')} Medium slippage   ${chalk.red('⚠')} High slippage`));
    
    // Інструкції
    console.log(chalk.gray(`\n  Press ${chalk.white('Ctrl+C')} to exit`));
  }

  /**
   * Вивід помилки
   */
  renderError(error: Error): void {
    this.clearScreen();
    console.log(chalk.red.bold('\n❌ Error occurred'));
    console.log(chalk.red(`   ${error.message}`));
    console.log(chalk.gray(`\n   ${error.stack?.split('\n')[1] || ''}`));
    console.log(chalk.gray('\n   Monitor will continue...\n'));
  }

  /**
   * Вивід повідомлення про підключення
   */
  renderConnecting(rpcUrl: string): void {
    this.clearScreen();
    console.log(chalk.cyan.bold('\n🔌 Connecting to Solana RPC...'));
    console.log(chalk.gray(`   URL: ${rpcUrl}`));
    console.log(chalk.gray('   Please wait...\n'));
  }

  /**
   * Вивід повідомлення про успішне підключення
   */
  renderConnected(poolsFound: number): void {
    console.log(chalk.green.bold('\n✅ Connected successfully'));
    console.log(chalk.green(`   Found ${poolsFound} Raydium CPMM pools`));
    console.log(chalk.gray('   Starting monitoring...\n'));
    
    // Невелика затримка для читання повідомлення
    setTimeout(() => {}, 1000);
  }

  /**
   * Скидання рендерера
   */
  reset(): void {
    this.renderCount = 0;
    this.opportunitiesHistory = [];
  }
}

/**
 * Простий рендерер для виводу в один рядок (без очищення екрану)
 */
export class SimpleRenderer {
  render(opportunities: Opportunity[], options: RenderOptions): void {
    if (opportunities.length === 0) {
      process.stdout.write(`\r⏳ No opportunities | ${new Date().toLocaleTimeString()}     `);
      return;
    }
    
    const best = opportunities[0];
    if (!best) return;
    
    const profitStr = formatProfit(best.netProfit, true);
    process.stdout.write(`\r💰 Best: ${profitStr} | ${best.profitPercent.toFixed(2)}% | ${new Date().toLocaleTimeString()}     `);
  }
}

// Експорт публічного API
export default {
  Renderer,
  SimpleRenderer,
};