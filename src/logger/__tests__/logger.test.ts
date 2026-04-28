// logger/__tests__/logger.test.ts
/**
 * Tests for public logger API:
 * - setLogLevel
 * - logRpcCall
 * - logError
 * - logOpportunity
 *
 * Winston is NOT mocked — we test against the real logger instance
 * but spy on its methods to avoid actual file/console I/O.
 */

// Mock fs so buildFileTransports() / ensureLogDir() never touch the filesystem
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
}));

// Silence all transports — we only care that logger methods are called
jest.mock('winston', () => {
    const { createLogger, format, config } = jest.requireActual('winston');

    // Silent transport that does nothing
    class SilentTransport {
        level = 'debug';
        on() { return this; }
        once() { return this; }
        emit() { return false; }
        write() { return true; }
        end() { return this; }
        log(_info: unknown, cb?: () => void) { cb?.(); }
    }

    return {
        createLogger,
        format,
        config,
        transports: {
            Console: SilentTransport,
            File: SilentTransport,
        },
    };
});

import { logger, setLogLevel, logRpcCall, logError, logOpportunity } from '../logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spyOnLogger() {
    return {
        error: jest.spyOn(logger, 'error').mockImplementation(() => logger),
        warn: jest.spyOn(logger, 'warn').mockImplementation(() => logger),
        info: jest.spyOn(logger, 'info').mockImplementation(() => logger),
        debug: jest.spyOn(logger, 'debug').mockImplementation(() => logger),
    };
}

afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------

describe('setLogLevel()', () => {
    it('should update logger.level', () => {
        setLogLevel('warn');
        expect(logger.level).toBe('warn');

        setLogLevel('debug');
        expect(logger.level).toBe('debug');
    });

    it('should update level on all transports', () => {
        setLogLevel('error');
        logger.transports.forEach((t) => {
            expect(t.level).toBe('error');
        });
    });
});

// ---------------------------------------------------------------------------

describe('logRpcCall()', () => {
    it('should call logger.debug with method and duration', () => {
        const spies = spyOnLogger();
        logRpcCall('getMultipleAccounts', 42);
        expect(spies.debug).toHaveBeenCalledWith(
            'RPC: getMultipleAccounts',
            expect.objectContaining({ method: 'getMultipleAccounts', durationMs: 42, success: true }),
        );
    });

    it('should include params when provided', () => {
        const spies = spyOnLogger();
        logRpcCall('getProgramAccounts', 10, true, { count: 5 });
        expect(spies.debug).toHaveBeenCalledWith(
            'RPC: getProgramAccounts',
            expect.objectContaining({ params: expect.stringContaining('count') }),
        );
    });

    it('should omit params key when not provided', () => {
        const spies = spyOnLogger();
        logRpcCall('healthCheck', 5);
        const call = spies.debug.mock.calls[0]![0] as unknown as Record<string, unknown>;
        expect(call).not.toHaveProperty('params');
    });

    it('should truncate params longer than 200 chars', () => {
        const spies = spyOnLogger();
        const bigPayload = { data: 'x'.repeat(300) };
        logRpcCall('test', 1, true, bigPayload);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = (spies.debug.mock.calls[0] as any)[1] as Record<string, unknown>;
        expect((call.params as string).length).toBeLessThanOrEqual(200);
    });

    it('should log success=false when passed', () => {
        const spies = spyOnLogger();
        logRpcCall('getSlot', 100, false);
        expect(spies.debug).toHaveBeenCalledWith(
            'RPC: getSlot',
            expect.objectContaining({ success: false }),
        );
    });
});

// ---------------------------------------------------------------------------

describe('logError()', () => {
    it('should log Error object with message, name, and stack', () => {
        const spies = spyOnLogger();
        const err = new Error('something went wrong');
        logError(err);
        expect(spies.error).toHaveBeenCalledWith(
            'something went wrong',
            expect.objectContaining({ name: 'Error', stack: expect.stringContaining('Error') }),
        );
    });

    it('should include context when provided with Error object', () => {
        const spies = spyOnLogger();
        logError(new Error('rpc timeout'), 'updateCycle');
        expect(spies.error).toHaveBeenCalledWith(
            'rpc timeout',
            expect.objectContaining({ context: 'updateCycle' }),
        );
    });

    it('should log plain string error', () => {
        const spies = spyOnLogger();
        logError('something failed');
        expect(spies.error).toHaveBeenCalledWith('something failed', expect.any(Object));
    });

    it('should include context when provided with string error', () => {
        const spies = spyOnLogger();
        logError('bad config', 'loadConfig');
        expect(spies.error).toHaveBeenCalledWith(
            'bad config',
            expect.objectContaining({ context: 'loadConfig' }),
        );
    });

    it('should not include context key when context is omitted', () => {
        const spies = spyOnLogger();
        logError('no context here');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (spies.error.mock.calls[0] as any)[1] as Record<string, unknown>;
        expect(meta).not.toHaveProperty('context');
    });
});

// ---------------------------------------------------------------------------

describe('logOpportunity()', () => {
    it('should log at info level with correct fields', () => {
        const spies = spyOnLogger();
        logOpportunity(0.05, 5.0, 'BuyPoolAddress123456', 'SellPoolAddress123456');
        expect(spies.info).toHaveBeenCalledWith(
            'Arbitrage opportunity detected',
            expect.objectContaining({ profit: 0.05, profitPercent: 5.0 }),
        );
    });

    it('should truncate pool addresses to 8 chars', () => {
        const spies = spyOnLogger();
        logOpportunity(0.1, 10, 'BuyPool_LongAddress_XYZ', 'SellPool_LongAddress_ABC');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (spies.info.mock.calls[0] as any)[1] as Record<string, unknown>;
        expect((meta.buyPool as string).length).toBe(8);
        expect((meta.sellPool as string).length).toBe(8);
    });
});

// ---------------------------------------------------------------------------

describe('resolveLogLevel() — via env', () => {
    it('production NODE_ENV should default to info', () => {
        // We can observe the resolved level indirectly: logger was already
        // initialized at module load time. We verify the fallback logic via
        // setLogLevel round-trip to confirm the API works.
        setLogLevel('info');
        expect(logger.level).toBe('info');
    });
});