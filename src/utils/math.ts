// utils/math.ts
/**
 * Mathematical utilities for financial calculations.
 *
 * Decimal.js is used only for formatting and auxiliary operations.
 * Core arbitrage math (pricing.ts) uses native number —
 * sufficient for a monitoring tool and significantly faster.
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
// Types
// ---------------------------------------------------------------------------

export type MathInput = number | string | Decimal | bigint;

function toDecimal(value: MathInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value.toString());
  return new Decimal(value);
}

// ---------------------------------------------------------------------------
// Basic operations with high precision
// ---------------------------------------------------------------------------

export function add(a: MathInput, b: MathInput): number {
  return toDecimal(a).plus(toDecimal(b)).toNumber();
}

export function sub(a: MathInput, b: MathInput): number {
  return toDecimal(a).minus(toDecimal(b)).toNumber();
}

export function mul(a: MathInput, b: MathInput): number {
  return toDecimal(a).times(toDecimal(b)).toNumber();
}

/**
 * @throws {Error} on division by zero
 */
export function div(a: MathInput, b: MathInput): number {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new Error('Division by zero');
  return toDecimal(a).dividedBy(divisor).toNumber();
}

export function abs(value: MathInput): number {
  return toDecimal(value).abs().toNumber();
}

export function min(a: MathInput, b: MathInput): number {
  return Decimal.min(toDecimal(a), toDecimal(b)).toNumber();
}

export function max(a: MathInput, b: MathInput): number {
  return Decimal.max(toDecimal(a), toDecimal(b)).toNumber();
}

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/**
 * Round to N decimal places.
 * Default is ROUND_DOWN — conservative for financial calculations.
 */
export function round(
  value: MathInput,
  decimals = 9,
  rounding: Decimal.Rounding = Decimal.ROUND_DOWN,
): number {
  return toDecimal(value).toDecimalPlaces(decimals, rounding).toNumber();
}

/**
 * Clamp value within the range [minVal, maxVal].
 */
export function clamp(value: MathInput, minVal: MathInput, maxVal: MathInput): number {
  const v = toDecimal(value);
  const lo = toDecimal(minVal);
  const hi = toDecimal(maxVal);
  if (v.lessThan(lo)) return lo.toNumber();
  if (v.greaterThan(hi)) return hi.toNumber();
  return v.toNumber();
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two numbers with epsilon precision.
 * @returns 1 | 0 | -1
 */
export function compare(a: MathInput, b: MathInput, epsilon = 1e-12): number {
  const diff = toDecimal(a).minus(toDecimal(b)).abs();
  if (diff.lessThanOrEqualTo(epsilon)) return 0;
  return toDecimal(a).greaterThan(toDecimal(b)) ? 1 : -1;
}

export function isZero(value: MathInput, epsilon = 1e-12): boolean {
  return toDecimal(value).abs().lessThanOrEqualTo(epsilon);
}

// ---------------------------------------------------------------------------
// Formatting (used in UI and logger)
// ---------------------------------------------------------------------------

/**
 * Format number for output.
 * stripTrailingZeros: '1.500000' -> '1.5'
 */
export function formatNumber(
  value: MathInput,
  decimals = 6,
  stripTrailingZeros = true,
): string {
  const rounded = toDecimal(value).toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
  const fixed = rounded.toFixed(decimals);
  return stripTrailingZeros ? fixed.replace(/\.?0+$/, '') : fixed;
}

// ---------------------------------------------------------------------------
// bigint <-> Decimal Conversion
// ---------------------------------------------------------------------------

/**
 * Convert bigint (raw lamports) -> Decimal considering decimals.
 * @example bigintToDecimal(1_000_000n, 6) -> Decimal('1')
 */
export function bigintToDecimal(value: bigint, decimals = 0): Decimal {
  return new Decimal(value.toString()).dividedBy(new Decimal(10).pow(decimals));
}

/**
 * Convert Decimal -> bigint.
 * @throws {Error} if there is a fractional part after scaling
 */
export function decimalToBigint(value: Decimal, decimals = 0): bigint {
  const scaled = value.times(new Decimal(10).pow(decimals));
  if (!scaled.isInteger()) {
    throw new Error(
      `Value ${value.toString()} has more than ${decimals} decimal places`,
    );
  }
  return BigInt(scaled.toString());
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Percentage change: (new - old) / old * 100
 */
export function percentChange(oldValue: MathInput, newValue: MathInput): number {
  const old = toDecimal(oldValue);
  if (old.isZero()) return 0;
  return toDecimal(newValue).minus(old).dividedBy(old).times(100).toNumber();
}