// logger/logger.ts
/**
 * Singleton логер для всього проєкту (Winston)
 *
 * Особливості:
 * - Ініціалізується з дефолтним рівнем (info) без залежності від config/
 * - Рівень логування можна оновити після завантаження конфігурації
 * - Структуровані JSON логи у файли, читабельний вивід у консоль
 * - Ротація лог-файлів (10 MB, 5 файлів)
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Константи
// ---------------------------------------------------------------------------

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

// ---------------------------------------------------------------------------
// Ініціалізація директорії для логів (ліниво — тільки при першому записі)
// ---------------------------------------------------------------------------

function ensureLogDir(): string {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  return LOG_DIR;
}

// ---------------------------------------------------------------------------
// Визначення рівня логування
// ---------------------------------------------------------------------------

const VALID_LEVELS = ['error', 'warn', 'info', 'http', 'debug'] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

function resolveLogLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && VALID_LEVELS.includes(fromEnv as LogLevel)) {
    return fromEnv as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

// ---------------------------------------------------------------------------
// Формати
// ---------------------------------------------------------------------------

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Видаляємо внутрішні поля Winston
    const { splat, label, ...rest } = meta as Record<string, unknown>;
    const hasMeta = Object.keys(rest).length > 0;
    const metaStr = hasMeta ? `\n  └─ ${JSON.stringify(rest, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ---------------------------------------------------------------------------
// Транспорти
// ---------------------------------------------------------------------------

function buildFileTransports(): winston.transport[] {
  const logDir = ensureLogDir();

  return [
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: MAX_FILE_SIZE,
      maxFiles: MAX_FILES,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: MAX_FILE_SIZE,
      maxFiles: MAX_FILES,
      tailable: true,
    }),
  ];
}

function buildExceptionTransports(): winston.transport[] {
  const logDir = ensureLogDir();

  return [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: fileFormat,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Створення логера
// ---------------------------------------------------------------------------

const initialLevel = resolveLogLevel();

export const logger = winston.createLogger({
  level: initialLevel,
  levels: winston.config.npm.levels,
  format: fileFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: initialLevel,
    }),
    ...buildFileTransports(),
  ],
  exceptionHandlers: buildExceptionTransports(),
  rejectionHandlers: buildExceptionTransports(),
  exitOnError: false,
});

// ---------------------------------------------------------------------------
// Публічний API
// ---------------------------------------------------------------------------

/**
 * Оновлення рівня логування після завантаження конфігурації.
 * Викликати з orchestrator після loadConfig().
 */
export function setLogLevel(level: LogLevel): void {
  logger.level = level;
  logger.transports.forEach((t) => {
    t.level = level;
  });
}

/**
 * Увімкнення/вимкнення запису у файли.
 * При logToFile=false — залишається тільки консоль.
 */
export function setFileLogging(enabled: boolean): void {
  logger.transports.forEach((t) => {
    if (t instanceof winston.transports.File) {
      t.silent = !enabled;
    }
  });
}

/**
 * Child-логер з фіксованим контекстом (наприклад, для кожного модуля).
 *
 * @example
 * const log = createChildLogger('PoolDiscovery');
 * log.info('Found pools', { count: 5 });
 * // → { context: 'PoolDiscovery', message: 'Found pools', count: 5 }
 */
export function createChildLogger(context: string): winston.Logger {
  return logger.child({ context });
}

/**
 * Логування помилки з повним стеком.
 */
export function logError(error: Error | string, context?: string): void {
  if (error instanceof Error) {
    logger.error(error.message, {
      name: error.name,
      stack: error.stack,
      ...(context ? { context } : {}),
    });
  } else {
    logger.error(error, { ...(context ? { context } : {}) });
  }
}

/**
 * Логування тривалості операції.
 */
export function logPerformance(operation: string, durationMs: number, success = true): void {
  logger.log(success ? 'debug' : 'warn', `Performance: ${operation}`, {
    operation,
    durationMs,
    success,
  });
}

/**
 * Логування RPC виклику (рівень debug).
 */
export function logRpcCall(
  method: string,
  durationMs: number,
  success = true,
  params?: unknown,
): void {
  logger.debug(`RPC: ${method}`, {
    method,
    durationMs,
    success,
    ...(params !== undefined
      ? { params: JSON.stringify(params).slice(0, 200) }
      : {}),
  });
}

/**
 * Логування знайденої арбітражної можливості.
 */
export function logOpportunity(
  profit: number,
  profitPercent: number,
  buyPool: string,
  sellPool: string,
): void {
  logger.info('Arbitrage opportunity detected', {
    profit,
    profitPercent,
    buyPool: buyPool.slice(0, 8),
    sellPool: sellPool.slice(0, 8),
  });
}