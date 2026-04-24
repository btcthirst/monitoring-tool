// ui/formatters.ts
/**
 * Чисті функції форматування для виводу в консоль.
 *
 * Правила:
 * - Жодних side effects
 * - Жодної бізнес-логіки
 * - chalk тільки тут, не в renderer напряму
 */

import chalk from 'chalk';
import { formatNumber as mathFormatNumber } from '../utils/math';

// ---------------------------------------------------------------------------
// Адреси
// ---------------------------------------------------------------------------

/**
 * Скорочення адреси: перші N + останні N символів.
 * @example formatAddress('So111...112', 4, 4) → 'So11...1112'
 */
export function formatAddress(
  address: string,
  startLength = 4,
  endLength = 4,
): string {
  if (address.length <= startLength + endLength) return address;
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

export function formatAddressColored(address: string, startLength = 4, endLength = 4): string {
  return chalk.cyan(formatAddress(address, startLength, endLength));
}

// ---------------------------------------------------------------------------
// Числа
// ---------------------------------------------------------------------------

/**
 * Форматування числа з заданою точністю.
 * Делегує до utils/math.ts для консистентності.
 */
export function formatNumber(
  value: number,
  decimals = 6,
  stripZeros = true,
): string {
  return mathFormatNumber(value, decimals, stripZeros);
}

/**
 * Скорочення великих чисел (K / M / B).
 */
export function formatAbbreviated(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return formatNumber(value, 2);
}

// ---------------------------------------------------------------------------
// Прибуток та відсотки
// ---------------------------------------------------------------------------

/**
 * Форматування прибутку з кольором (зелений / червоний).
 */
export function formatProfit(profit: number): string {
  const sign = profit >= 0 ? '+' : '-';
  const formatted = formatNumber(Math.abs(profit), 6);

  if (profit > 0) return chalk.green(`${sign}${formatted}`);
  if (profit < 0) return chalk.red(`${sign}${formatted}`);
  return chalk.gray('0.000000');
}

/**
 * Форматування відсотку з кольором.
 * @param isPositiveGood — true: зелений при > 0, false: нейтральний
 */
export function formatPercent(value: number, isPositiveGood = true, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  const formatted = `${sign}${value.toFixed(decimals)}%`;

  if (value > 0 && isPositiveGood) return chalk.green(formatted);
  if (value < 0) return chalk.red(formatted);
  return chalk.gray(formatted);
}

/**
 * Форматування slippage.
 * Приймає відносне відхилення (−0.003 = −0.3%).
 */
export function formatSlippage(slippage: number): string {
  const percent = Math.abs(slippage) * 100;
  const formatted = `${percent.toFixed(3)}%`;

  if (percent < 0.1) return chalk.green(formatted);
  if (percent < 1.0) return chalk.yellow(formatted);
  return chalk.red(formatted);
}

/**
 * Форматування fee (десятковий дріб → відсоток).
 * @example formatFee(0.0025) → '0.25%'
 */
export function formatFee(fee: number): string {
  return chalk.gray(`${(fee * 100).toFixed(2)}%`);
}

// ---------------------------------------------------------------------------
// Ціна та розмір угоди
// ---------------------------------------------------------------------------

export function formatPrice(price: number, quoteSymbol = 'USDC', decimals = 6): string {
  return `${formatNumber(price, decimals)} ${quoteSymbol}`;
}

export function formatTradeSize(size: number, quoteSymbol = 'USDC'): string {
  return chalk.cyan(`${formatNumber(size, 2)} ${quoteSymbol}`);
}

// ---------------------------------------------------------------------------
// Час
// ---------------------------------------------------------------------------

/**
 * Відносний час від таймстемпу.
 * @example formatRelativeTime(Date.now() - 5000) → '5s ago'
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
// UI елементи
// ---------------------------------------------------------------------------

/**
 * Горизонтальний роздільник.
 */
export function formatSeparator(char = '═', width = 80): string {
  return chalk.gray(char.repeat(width));
}

/**
 * Рядок ключ-значення з вирівнюванням.
 */
export function formatKeyValue(key: string, value: string, keyWidth = 16): string {
  return `${chalk.gray(key.padEnd(keyWidth))} ${value}`;
}

/**
 * Статус з іконкою.
 */
export function formatStatus(
  status: 'success' | 'error' | 'warning' | 'info',
  message: string,
): string {
  const icons = { success: '✅', error: '❌', warning: '⚠️ ', info: 'ℹ️ ' };
  const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
  };
  return `${icons[status]} ${colors[status](message)}`;
}

/**
 * Довжина рядка без ANSI escape кодів (для правильного padding).
 */
export function visibleLength(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Padding рядка до заданої видимої ширини (враховує ANSI коди).
 */
export function padVisible(str: string, width: number, char = ' '): string {
  const len = visibleLength(str);
  return len >= width ? str : str + char.repeat(width - len);
}