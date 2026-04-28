// utils/math.ts
/**
 * Mathematical utilities for financial calculations.
 *
 * ## Design decision: native number in pricing.ts
 *
 * Core CPMM math (pricing.ts) intentionally uses native float64, not Decimal.js.
 * Rationale:
 *   - float64 gives ~15 significant digits — sufficient for reserve values up to
 *     ~10^12 tokens with 6-decimal precision (typical for USDC, USDT, etc.)
 *   - Solana reserves are stored as u64 (max ~1.8 × 10^19 raw lamports).
 *     After normalizeAmount() divides by 10^decimals, the working range is
 *     well within float64 safe range for any realistic pool size.
 *   - This tool signals opportunities only — it does not execute trades.
 *     Sub-cent rounding error does not affect correctness of opportunity detection.
 *   - Native arithmetic is ~10–100× faster than Decimal.js, which matters
 *     in a tight polling loop across multiple pool pairs.
 *
 * Decimal.js is used for *output formatting* (formatNumber) because
 * toFixed() rounding in JS has known edge cases (e.g. (1.005).toFixed(2) === '1.00').
 * Decimal.ROUND_DOWN gives conservative, predictable display values.
 *
 * If this tool is extended to execute trades (not just monitor), migrate
 * getAmountOut() and simulateTwoHopArbitrage() to use Decimal arithmetic
 * to eliminate accumulated rounding error on multi-hop paths.
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