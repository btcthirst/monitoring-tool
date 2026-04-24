// utils/math.ts
/**
 * Математичні утиліти для фінансових розрахунків.
 *
 * Decimal.js використовується тільки для форматування та допоміжних операцій.
 * Основна математика арбітражу (pricing.ts) використовує нативний number —
 * для моніторингового інструменту це достатньо і значно швидше.
 */

import Decimal from 'decimal.js';

// Налаштування Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_DOWN, // Консервативне округлення для фінансів
  toExpNeg: -18,
  toExpPos: 18,
});

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

export type MathInput = number | string | Decimal | bigint;

function toDecimal(value: MathInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value.toString());
  return new Decimal(value);
}

// ---------------------------------------------------------------------------
// Базові операції з високою точністю
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
 * @throws {Error} при діленні на нуль
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
// Округлення
// ---------------------------------------------------------------------------

/**
 * Округлення до N знаків після коми.
 * За замовчуванням ROUND_DOWN — консервативне для фінансових розрахунків.
 */
export function round(
  value: MathInput,
  decimals = 9,
  rounding: Decimal.Rounding = Decimal.ROUND_DOWN,
): number {
  return toDecimal(value).toDecimalPlaces(decimals, rounding).toNumber();
}

/**
 * Обмеження значення в діапазоні [minVal, maxVal].
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
// Порівняння
// ---------------------------------------------------------------------------

/**
 * Порівняння двох чисел з epsilon-точністю.
 * @returns 1 | 0 | -1
 */
export function compare(a: MathInput, b: MathInput, epsilon = 1e-12): number {
  const diff = toDecimal(a).minus(toDecimal(b)).abs();
  if (diff.lessThan(epsilon)) return 0;
  return toDecimal(a).greaterThan(toDecimal(b)) ? 1 : -1;
}

export function isZero(value: MathInput, epsilon = 1e-12): boolean {
  return toDecimal(value).abs().lessThan(epsilon);
}

// ---------------------------------------------------------------------------
// Форматування (використовується в UI та logger)
// ---------------------------------------------------------------------------

/**
 * Форматування числа для виводу.
 * stripTrailingZeros: '1.500000' → '1.5'
 */
export function formatNumber(
  value: MathInput,
  decimals = 6,
  stripTrailingZeros = true,
): string {
  const rounded = round(value, decimals).toString();
  // Переконуємось що є десяткова крапка перед strip
  const withDot = rounded.includes('.') ? rounded : `${rounded}.${'0'.repeat(decimals)}`;
  return stripTrailingZeros ? withDot.replace(/\.?0+$/, '') : withDot;
}

// ---------------------------------------------------------------------------
// Конвертація bigint ↔ Decimal
// ---------------------------------------------------------------------------

/**
 * Конвертація bigint (raw lamports) → Decimal з урахуванням decimals.
 * @example bigintToDecimal(1_000_000n, 6) → Decimal('1')
 */
export function bigintToDecimal(value: bigint, decimals = 0): Decimal {
  return new Decimal(value.toString()).dividedBy(new Decimal(10).pow(decimals));
}

/**
 * Конвертація Decimal → bigint.
 * @throws {Error} якщо є дробова частина після масштабування
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
// Статистика
// ---------------------------------------------------------------------------

/**
 * Відсоткова зміна: (new − old) / old × 100
 */
export function percentChange(oldValue: MathInput, newValue: MathInput): number {
  const old = toDecimal(oldValue);
  if (old.isZero()) return 0;
  return toDecimal(newValue).minus(old).dividedBy(old).times(100).toNumber();
}