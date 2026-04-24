// ui/formatters.ts
/**
 * Форматувальники для виводу даних в консоль
 * 
 * Відповідальність:
 * - Форматування адрес токенів/пулів
 * - Форматування чисел та цін
 * - Форматування відсотків та прибутків
 * 
 * ВАЖЛИВО:
 * - Чисті функції без side effects
 * - Не містять бізнес-логіки
 */

import chalk from 'chalk';
import { formatNumber as mathFormatNumber, round } from '../utils/math';

/**
 * Форматування адреси (обрізання до 4+4 символів)
 * 
 * @example
 * formatAddress('So11111111111111111111111111111111111111112')
 * // 'So11...112'
 */
export function formatAddress(address: string, startLength: number = 4, endLength: number = 4): string {
  if (address.length <= startLength + endLength) {
    return address;
  }
  
  const start = address.slice(0, startLength);
  const end = address.slice(-endLength);
  
  return `${start}...${end}`;
}

/**
 * Форматування адреси з кольором
 */
export function formatAddressColored(address: string, startLength: number = 4, endLength: number = 4): string {
  const formatted = formatAddress(address, startLength, endLength);
  return chalk.cyan(formatted);
}

/**
 * Форматування токена (адреса + символ, якщо відомий)
 */
export function formatToken(
  address: string, 
  symbol?: string, 
  startLength: number = 6, 
  endLength: number = 4
): string {
  const shortAddress = formatAddress(address, startLength, endLength);
  
  if (symbol) {
    return `${chalk.yellow(symbol)} (${chalk.gray(shortAddress)})`;
  }
  
  return chalk.gray(shortAddress);
}

/**
 * Форматування числа з заданою точністю
 * Використовує утиліту з math.ts
 */
export function formatNumber(
  value: number, 
  decimals: number = 6, 
  stripZeros: boolean = true
): string {
  return mathFormatNumber(value, decimals, stripZeros);
}

/**
 * Форматування ціни
 */
export function formatPrice(
  price: number, 
  quoteSymbol: string = 'USDC', 
  decimals: number = 6
): string {
  const formatted = formatNumber(price, decimals);
  return `${formatted} ${quoteSymbol}`;
}

/**
 * Форматування прибутку з кольором
 */
export function formatProfit(profit: number, isPositive: boolean = true): string {
  const formatted = formatNumber(Math.abs(profit), 6);
  const sign = profit >= 0 ? '+' : '-';
  
  if (isPositive && profit > 0) {
    return chalk.green(`${sign}${formatted}`);
  } else if (profit > 0) {
    return chalk.white(`${sign}${formatted}`);
  } else if (profit === 0) {
    return chalk.gray('0.00');
  } else {
    return chalk.red(`${sign}${formatted}`);
  }
}

/**
 * Форматування відсотків з кольором
 */
export function formatPercent(value: number, isGood: boolean = true, decimals: number = 2): string {
  const formatted = value.toFixed(decimals);
  const sign = value > 0 ? '+' : '';
  
  if (isGood && value > 0) {
    return chalk.green(`${sign}${formatted}%`);
  } else if (value > 0) {
    return chalk.white(`${sign}${formatted}%`);
  } else if (value === 0) {
    return chalk.gray('0.00%');
  } else {
    return chalk.red(`${formatted}%`);
  }
}

/**
 * Форматування прослизання (slippage)
 */
export function formatSlippage(slippage: number): string {
  const percent = Math.abs(slippage * 100);
  const formatted = percent.toFixed(4);
  
  if (percent < 0.1) {
    return chalk.green(`${formatted}%`);
  } else if (percent < 1) {
    return chalk.yellow(`${formatted}%`);
  } else {
    return chalk.red(`${formatted}%`);
  }
}

/**
 * Форматування комісії (fee)
 */
export function formatFee(fee: number): string {
  const percent = fee * 100;
  return chalk.gray(`${percent.toFixed(2)}%`);
}

/**
 * Форматування розміру угоди
 */
export function formatTradeSize(size: number, quoteSymbol: string = 'USDC'): string {
  const formatted = formatNumber(size, 2);
  return chalk.cyan(`${formatted} ${quoteSymbol}`);
}

/**
 * Форматування резервів пулу
 */
export function formatReserves(
  reserveA: number, 
  reserveB: number, 
  tokenASymbol: string = '', 
  tokenBSymbol: string = ''
): string {
  const formattedA = formatNumber(reserveA, 2);
  const formattedB = formatNumber(reserveB, 2);
  
  if (tokenASymbol && tokenBSymbol) {
    return `${formattedA} ${tokenASymbol} / ${formattedB} ${tokenBSymbol}`;
  }
  
  return `${formattedA} / ${formattedB}`;
}

/**
 * Форматування часу (відносний)
 */
export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return 'just now';
}

/**
 * Форматування розміру в human-readable формат
 */
export function formatSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  
  return `${value.toFixed(2)} ${sizes[i]}`;
}

/**
 * Форматування з комами (для великих чисел)
 */
export function formatWithCommas(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Скорочення великих чисел (K, M, B, T)
 */
export function formatAbbreviated(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return formatNumber(value, 2);
}

/**
 * Форматування рядка в заголовок
 */
export function formatTitle(text: string, width: number = 80): string {
  const padding = Math.max(0, (width - text.length - 4) / 2);
  const leftPad = ' '.repeat(Math.floor(padding));
  const rightPad = ' '.repeat(Math.ceil(padding));
  
  return chalk.cyan.bold(`\n${leftPad}🔍 ${text}${rightPad}\n`);
}

/**
 * Форматування роздільника
 */
export function formatSeparator(char: string = '═', width: number = 80): string {
  return chalk.gray(char.repeat(width));
}

/**
 * Форматування ключ-значення для виводу
 */
export function formatKeyValue(key: string, value: string, keyWidth: number = 15): string {
  const paddedKey = key.padEnd(keyWidth, ' ');
  return `${chalk.gray(paddedKey)} ${value}`;
}

/**
 * Форматування таблиці в простий текст
 */
export function formatSimpleTable(rows: string[][], headers?: string[]): string {
  if (rows.length === 0) return '';
  
  // Визначення ширини колонок
  const colCount = rows[0]?.length || 0;
  const colWidths: number[] = new Array(colCount).fill(0);
  
  if (headers) {
    headers.forEach((h, i) => {
      colWidths[i] = Math.max(colWidths[i], h.length);
    });
  }
  
  rows.forEach(row => {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  });
  
  const lines: string[] = [];
  
  // Хедери
  if (headers) {
    const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ');
    lines.push(chalk.cyan.bold(headerLine));
    lines.push(chalk.gray('─'.repeat(headerLine.length)));
  }
  
  // Дані
  rows.forEach(row => {
    const line = row.map((cell, i) => cell.padEnd(colWidths[i])).join(' │ ');
    lines.push(line);
  });
  
  return lines.join('\n');
}

/**
 * Форматування буллет-листа
 */
export function formatBulletList(items: string[], color: (text: string) => string = chalk.white): string {
  return items.map(item => `  • ${color(item)}`).join('\n');
}

/**
 * Форматування числа з плаваючою точкою без втрати точності
 */
export function formatExact(value: number, maxDecimals: number = 18): string {
  // Видаляємо науковий запис
  const str = value.toFixed(maxDecimals);
  // Видаляємо зайві нулі
  return str.replace(/\.?0+$/, '');
}

/**
 * Форматування статусу з іконкою
 */
export function formatStatus(status: 'success' | 'error' | 'warning' | 'info', message: string): string {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };
  
  const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
  };
  
  const icon = icons[status];
  const color = colors[status];
  
  return `${icon} ${color(message)}`;
}

// Експорт публічного API
export default {
  formatAddress,
  formatAddressColored,
  formatToken,
  formatNumber,
  formatPrice,
  formatProfit,
  formatPercent,
  formatSlippage,
  formatFee,
  formatTradeSize,
  formatReserves,
  formatRelativeTime,
  formatSize,
  formatWithCommas,
  formatAbbreviated,
  formatTitle,
  formatSeparator,
  formatKeyValue,
  formatSimpleTable,
  formatBulletList,
  formatExact,
  formatStatus,
};