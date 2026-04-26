// utils/math.ts
/**
 * Mathematical utilities for financial calculations.
 *
 * Decimal.js is used only for formatting and auxiliary operations.
 * Core arbitrage math (pricing.ts) uses native number —
 * sufficient for a monitoring tool and significantly faster.
 *
 * Note: float64 precision is adequate for price monitoring but may
 * accumulate error on very large reserve values. This tool signals
 * opportunities only — execution risk remains with the caller.
 */

import Decimal from 'decimal.js';

// Decimal.js configuration
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_DOWN, // Conservative rounding for finance
  toExpNeg: -18,
  toExpPos: 18,
});

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function toDecimal(value: number | string | Decimal | bigint): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value.toString());
  return new Decimal(value);
}

// ---------------------------------------------------------------------------
// Basic operations with high precision
// ---------------------------------------------------------------------------

export function add(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  return toDecimal(a).plus(toDecimal(b)).toNumber();
}

export function sub(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  return toDecimal(a).minus(toDecimal(b)).toNumber();
}

export function mul(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  return toDecimal(a).times(toDecimal(b)).toNumber();
}

/**
 * @throws {Error} on division by zero
 */
export function div(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new Error('Division by zero');
  return toDecimal(a).dividedBy(divisor).toNumber();
}

export function abs(value: number | string | Decimal | bigint): number {
  return toDecimal(value).abs().toNumber();
}

export function min(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  return Decimal.min(toDecimal(a), toDecimal(b)).toNumber();
}

export function max(a: number | string | Decimal | bigint, b: number | string | Decimal | bigint): number {
  return Decimal.max(toDecimal(a), toDecimal(b)).toNumber();
}

// ---------------------------------------------------------------------------
// Formatting (used in UI and logger)
// ---------------------------------------------------------------------------

/**
 * Format number for output.
 * stripTrailingZeros: '1.500000' -> '1.5'
 *
 * Returns 'NaN' / 'Infinity' / '-Infinity' for non-finite number inputs
 * instead of throwing — safe to use in logging and UI.
 */
export function formatNumber(
  value: number | string | Decimal | bigint,
  decimals = 6,
  stripTrailingZeros = true,
): string {
  // Guard: Decimal.js throws on NaN/Infinity, handle them explicitly
  if (typeof value === 'number' && !isFinite(value)) {
    return String(value); // 'NaN', 'Infinity', '-Infinity'
  }
  const rounded = toDecimal(value).toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
  const fixed = rounded.toFixed(decimals);
  // Only strip zeros that appear after the decimal point:
  // '1.500000' → '1.5', '1.000000' → '1', but '1000000' stays '1000000'
  return stripTrailingZeros ? fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : fixed;
}