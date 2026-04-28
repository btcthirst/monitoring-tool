// ui/formatters.ts
/**
 * Pure formatting functions for console output.
 *
 * Rules:
 * - No side effects
 * - No business logic
 * - chalk only used here, not directly in renderer
 */

import chalk from 'chalk';
import { formatNumber } from '../utils/math';

/**
 * Format spot price (quote units per base token).
 * @example formatSpotPrice(150.25, 'USDC') -> '150.25 USDC'
 */
export function formatSpotPrice(price: number, quoteSymbol: string): string {
  return chalk.white(`${formatNumber(price, 4)} ${quoteSymbol}`);
}

// ---------------------------------------------------------------------------
// Profit and percentages
// ---------------------------------------------------------------------------

/**
 * Format profit with color (green / red).
 */
export function formatProfit(profit: number): string {
  const sign = profit >= 0 ? '+' : '-';
  const formatted = formatNumber(Math.abs(profit), 6);

  if (profit > 0) return chalk.green(`${sign}${formatted}`);
  if (profit < 0) return chalk.red(`${sign}${formatted}`);
  return chalk.gray('0.000000');
}

/**
 * Format percentage with color.
 * @param isPositiveGood — true: green if > 0, false: neutral
 */
export function formatPercent(value: number, isPositiveGood = true, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  const formatted = `${sign}${value.toFixed(decimals)}%`;

  if (value > 0 && isPositiveGood) return chalk.green(formatted);
  if (value < 0) return chalk.red(formatted);
  return chalk.gray(formatted);
}

/**
 * Format slippage.
 * Accepts relative deviation (−0.003 = −0.3%).
 */
export function formatSlippage(slippage: number): string {
  const percent = Math.abs(slippage) * 100;
  const formatted = `${percent.toFixed(3)}%`;

  if (percent < 0.1) return chalk.green(formatted);
  if (percent < 1.0) return chalk.yellow(formatted);
  return chalk.red(formatted);
}

/**
 * Format fee (decimal -> percentage).
 * @example formatFee(0.0025) -> '0.25%'
 */
export function formatFee(fee: number): string {
  return chalk.gray(`${(fee * 100).toFixed(2)}%`);
}

export function formatTradeSize(size: number, quoteSymbol: string): string {
  return chalk.cyan(`${formatNumber(size, 2)} ${quoteSymbol}`);
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Relative time from timestamp.
 * @example formatRelativeTime(Date.now() - 5000) -> '5s ago'
 */
export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  if (s > 0) return `${s}s ago`;
  return 'just now';
}

// ---------------------------------------------------------------------------
// UI elements
// ---------------------------------------------------------------------------

/**
 * Horizontal separator.
 */
export function formatSeparator(char = '═', width = 80): string {
  return chalk.gray(char.repeat(width));
}

/**
 * Key-value string with padding.
 */
export function formatKeyValue(key: string, value: string, keyWidth = 16): string {
  return `${chalk.gray(key.padEnd(keyWidth))} ${value}`;
}

/**
 * String length without ANSI escape codes (for proper padding).
 */
export function visibleLength(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}