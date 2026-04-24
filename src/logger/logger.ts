// logger/logger.ts
/**
 * Логер для всього проекту
 * 
 * Відповідальність:
 * - Налаштування Winston логера
 * - Форматування логів для консолі та файлів
 * - Ротація лог-файлів
 * - Різні рівні логування
 * 
 * ВАЖЛИВО:
 * - Єдиний екземпляр логера для всього проекту
 * - Підтримка структурованого логування (JSON)
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Створення папки для логів, якщо її немає
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Форматування для консолі (читаємий вигляд)
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Додавання метаданих, якщо вони є
    if (Object.keys(meta).length > 0) {
      // Виключення спеціальних полів
      const { splat, label, ...rest } = meta;
      if (Object.keys(rest).length > 0) {
        log += `\n  └─ ${JSON.stringify(rest, null, 2)}`;
      }
    }
    
    return log;
  })
);

/**
 * Форматування для файлів (JSON)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

/**
 * Форматування для помилок з стеком
 */
const errorFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Конфігурація рівнів логування
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

/**
 * Визначення рівня логування на основі оточення
 */
const getLogLevel = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
  
  if (configuredLevel && levels[configuredLevel as keyof typeof levels] !== undefined) {
    return configuredLevel;
  }
  
  return env === 'production' ? 'info' : 'debug';
};

/**
 * Створення Winston логера
 */
export const logger = winston.createLogger({
  level: getLogLevel(),
  levels,
  format: fileFormat,
  transports: [
    // Консольний транспорт (завжди включений)
    new winston.transports.Console({
      format: consoleFormat,
      level: getLogLevel(),
    }),
    
    // Файл для всіх логів
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    
    // Файл тільки для помилок
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: errorFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: errorFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: errorFormat,
    }),
  ],
  exitOnError: false,
});

/**
 * Child логер з додатковим контекстом
 */
export function createChildLogger(context: string): winston.Logger {
  return logger.child({ context });
}

/**
 * Логування з додатковими метаданими
 */
export function logWithMeta(
  level: keyof typeof levels,
  message: string,
  meta: Record<string, unknown>
): void {
  logger.log(level, message, meta);
}

/**
 * Логування помилки з деталями
 */
export function logError(error: Error | string, context?: string): void {
  if (error instanceof Error) {
    logger.error(error.message, {
      stack: error.stack,
      name: error.name,
      context,
    });
  } else {
    logger.error(error, { context });
  }
}

/**
 * Логування продуктивності (таймер)
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  success: boolean = true
): void {
  const level = success ? 'info' : 'warn';
  logger.log(level, `Performance: ${operation}`, {
    operation,
    durationMs,
    success,
  });
}

/**
 * Логування RPC запитів
 */
export function logRpcCall(
  method: string,
  params: unknown,
  durationMs: number,
  success: boolean = true
): void {
  const level = process.env.LOG_LEVEL === 'debug' ? 'debug' : 'http';
  logger.log(level, `RPC Call: ${method}`, {
    method,
    params: typeof params === 'object' ? JSON.stringify(params).slice(0, 200) : params,
    durationMs,
    success,
  });
}

/**
 * Логування арбітражних можливостей
 */
export function logOpportunity(
  profit: number,
  profitPercent: number,
  buyPool: string,
  sellPool: string
): void {
  logger.info('Arbitrage opportunity detected', {
    profit,
    profitPercent,
    buyPool: buyPool.slice(0, 8),
    sellPool: sellPool.slice(0, 8),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Спеціальний HTTP логер (для Express, якщо знадобиться)
 */
export const httpLogger = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

/**
 * Функція для тестування логера (тільки для розробки)
 */
export function testLogger(): void {
  logger.debug('Debug message - for development');
  logger.info('Info message - normal operation');
  logger.warn('Warning message - something suspicious');
  logger.error('Error message - something failed');
  
  // Тест з метаданими
  logger.info('Test with metadata', {
    userId: 123,
    action: 'test',
    duration: 150,
  });
  
  // Тест помилки зі стеком
  try {
    throw new Error('Test error');
  } catch (error) {
    logError(error as Error, 'testLogger');
  }
}

// Експорт публічного API
export default {
  logger,
  createChildLogger,
  logWithMeta,
  logError,
  logPerformance,
  logRpcCall,
  logOpportunity,
  httpLogger,
  testLogger,
};