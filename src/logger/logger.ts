// logger/logger.ts
/**
 * Singleton logger for the whole project (Winston)
 *
 * Features:
 * - Initializes with a default level (info) without dependency on config/
 * - Log level can be updated after configuration is loaded
 * - Structured JSON logs to files, readable output to console
 * - Log file rotation (10 MB, 5 files)
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

// ---------------------------------------------------------------------------
// Initialize log directory (lazy — only on first write)
// ---------------------------------------------------------------------------

function ensureLogDir(): string {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  return LOG_DIR;
}

// ---------------------------------------------------------------------------
// Determine log level
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
// Formats
// ---------------------------------------------------------------------------

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
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
// Transports
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
// Create logger
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Update log level after configuration is loaded.
 * Call from orchestrator after loadConfig().
 */
export function setLogLevel(level: LogLevel): void {
  logger.level = level;
  logger.transports.forEach((t) => {
    t.level = level;
  });
}

/**
 * Log RPC call (debug level).
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
 * Log error with full stack trace.
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
 * Log detected arbitrage opportunity.
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