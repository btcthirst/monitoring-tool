// utils/math.ts
/**
 * Точні математичні операції з використанням Decimal.js
 * Та власних імплементацій для роботи з великими числами
 * 
 * ВАЖЛИВО: Всі операції зберігають точність до 18 знаків після коми
 */

import Decimal from 'decimal.js';

// Налаштування Decimal.js для фінансових розрахунків
Decimal.set({
  precision: 20,        // 20 знаків точності
  rounding: Decimal.ROUND_DOWN, // Завжди округлюємо в меншу сторону (conservative)
  toExpNeg: -18,        // Не використовуємо експоненційний запис для малих чисел
  toExpPos: 18,         // Не використовуємо експоненційний запис для великих чисел
});

/**
 * Підтримувані типи для математичних операцій
 */
export type MathInput = number | string | Decimal | bigint;

/**
 * Конвертація вхідного значення в Decimal
 */
function toDecimal(value: MathInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value.toString());
  return new Decimal(value);
}

/**
 * Додавання з високою точністю
 * 
 * @example
 * add(0.1, 0.2) // 0.3 (а не 0.30000000000000004)
 */
export function add(a: MathInput, b: MathInput): number {
  return toDecimal(a).plus(toDecimal(b)).toNumber();
}

/**
 * Віднімання з високою точністю
 */
export function sub(a: MathInput, b: MathInput): number {
  return toDecimal(a).minus(toDecimal(b)).toNumber();
}

/**
 * Множення з високою точністю
 */
export function mul(a: MathInput, b: MathInput): number {
  return toDecimal(a).times(toDecimal(b)).toNumber();
}

/**
 * Ділення з високою точністю
 * @throws {Error} при діленні на нуль
 */
export function div(a: MathInput, b: MathInput): number {
  const divisor = toDecimal(b);
  if (divisor.isZero()) {
    throw new Error('Division by zero');
  }
  return toDecimal(a).dividedBy(divisor).toNumber();
}

/**
 * Піднесення до степеня
 */
export function pow(base: MathInput, exponent: number): number {
  return toDecimal(base).pow(exponent).toNumber();
}

/**
 * Квадратний корінь
 */
export function sqrt(value: MathInput): number {
  const val = toDecimal(value);
  if (val.isNegative()) {
    throw new Error('Cannot calculate square root of negative number');
  }
  return val.sqrt().toNumber();
}

/**
 * Абсолютне значення
 */
export function abs(value: MathInput): number {
  return toDecimal(value).abs().toNumber();
}

/**
 * Мінімум з двох значень
 */
export function min(a: MathInput, b: MathInput): number {
  return Decimal.min(toDecimal(a), toDecimal(b)).toNumber();
}

/**
 * Максимум з двох значень
 */
export function max(a: MathInput, b: MathInput): number {
  return Decimal.max(toDecimal(a), toDecimal(b)).toNumber();
}

/**
 * Округлення до заданої кількості знаків
 * @param value - значення для округлення
 * @param decimals - кількість знаків після коми (default: 9 для Solana сумісності)
 * @param rounding - тип округлення (default: ROUND_DOWN - консервативне)
 */
export function round(
  value: MathInput,
  decimals: number = 9,
  rounding: Decimal.Rounding = Decimal.ROUND_DOWN
): number {
  return toDecimal(value).toDecimalPlaces(decimals, rounding).toNumber();
}

/**
 * Перевірка чи значення є "безпечним" числом
 * (не перевищує MAX_SAFE_INTEGER)
 */
export function isSafeNumber(value: number): boolean {
  return Number.isSafeInteger(value) || Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/**
 * Порівняння двох чисел з точністю
 * @returns 1 якщо a > b, -1 якщо a < b, 0 якщо рівні
 */
export function compare(a: MathInput, b: MathInput, epsilon: number = 1e-12): number {
  const aDec = toDecimal(a);
  const bDec = toDecimal(b);
  
  if (aDec.minus(bDec).abs().lessThan(epsilon)) return 0;
  return aDec.greaterThan(bDec) ? 1 : -1;
}

/**
 * Перевірка чи значення дорівнює нулю (з точністю)
 */
export function isZero(value: MathInput, epsilon: number = 1e-12): boolean {
  return toDecimal(value).abs().lessThan(epsilon);
}

/**
 * Форматування числа з заданою точністю для виводу
 */
export function formatNumber(
  value: MathInput,
  decimals: number = 6,
  stripTrailingZeros: boolean = true
): string {
  let formatted = round(value, decimals).toString();
  
  if (stripTrailingZeros) {
    formatted = formatted.replace(/\.?0+$/, '');
  }
  
  return formatted;
}

/**
 * Конвертація великого числа (bigint) в Decimal
 * Корисно для роботи з резервами з Solana
 */
export function bigintToDecimal(value: bigint, decimals: number = 0): Decimal {
  const divisor = new Decimal(10).pow(decimals);
  return new Decimal(value.toString()).dividedBy(divisor);
}

/**
 * Конвертація Decimal в bigint з урахуванням децималів
 * @throws {Error} якщо значення має занадто багато знаків після коми
 */
export function decimalToBigint(value: Decimal, decimals: number = 0): bigint {
  const multiplier = new Decimal(10).pow(decimals);
  const scaled = value.times(multiplier);
  
  // Перевірка чи немає дробової частини після масштабування
  if (!scaled.isInteger()) {
    throw new Error(`Value ${value.toString()} has more than ${decimals} decimal places`);
  }
  
  return BigInt(scaled.toString());
}

/**
 * Обчислення відсоткової зміни
 * @returns (newValue - oldValue) / oldValue * 100
 */
export function percentChange(oldValue: MathInput, newValue: MathInput): number {
  const oldDec = toDecimal(oldValue);
  if (oldDec.isZero()) return 0;
  
  const change = toDecimal(newValue).minus(oldDec);
  return change.dividedBy(oldDec).times(100).toNumber();
}

/**
 * Обмеження значення в діапазоні [min, max]
 */
export function clamp(value: MathInput, minVal: MathInput, maxVal: MathInput): number {
  const val = toDecimal(value);
  const minDec = toDecimal(minVal);
  const maxDec = toDecimal(maxVal);
  
  if (val.lessThan(minDec)) return minDec.toNumber();
  if (val.greaterThan(maxDec)) return maxDec.toNumber();
  return val.toNumber();
}

/**
 * Експоненційне згладжування для цін (EMA)
 * @param previousEma - попереднє EMA значення
 * @param currentPrice - поточна ціна
 * @param period - період згладжування (default: 14)
 */
export function calculateEma(
  previousEma: number,
  currentPrice: number,
  period: number = 14
): number {
  const multiplier = 2 / (period + 1);
  return add(
    mul(currentPrice, multiplier),
    mul(previousEma, 1 - multiplier)
  );
}

// Експорт публічного API
export default {
  add,
  sub,
  mul,
  div,
  pow,
  sqrt,
  abs,
  min,
  max,
  round,
  isSafeNumber,
  compare,
  isZero,
  formatNumber,
  bigintToDecimal,
  decimalToBigint,
  percentChange,
  clamp,
  calculateEma,
};