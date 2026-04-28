// config/__tests__/index.test.ts
/**
 * Tests for loadConfig() — priority: CLI args > .env > defaults
 */

// Mock dotenv so it never touches the filesystem during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

import { loadConfig } from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_MINT_A = 'So11111111111111111111111111111111111111112';
const VALID_MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Set env vars and return a cleanup function */
function withEnv(vars: Record<string, string>): () => void {
    const original: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
        original[k] = process.env[k];
        process.env[k] = v;
    }
    return () => {
        for (const [k, v] of Object.entries(original)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    };
}

// Clean all monitored env vars before each test
const ENV_KEYS = [
    'RPC_URL', 'MINT_A', 'MINT_B', 'QUOTE_MINT',
    'POLLING_INTERVAL_MS', 'MIN_PROFIT_THRESHOLD',
    'TRADE_SIZE', 'MAX_SLIPPAGE_PERCENT', 'TX_COST_IN_QUOTE', 'LOG_LEVEL',
];

beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('loadConfig — defaults', () => {
    it('should apply schema defaults when only required fields are provided', () => {
        const cfg = loadConfig({ mintA: VALID_MINT_A, mintB: VALID_MINT_B });

        expect(cfg.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
        expect(cfg.pollingIntervalMs).toBe(2000);
        expect(cfg.minProfitThreshold).toBe(0.01);
        expect(cfg.tradeSize).toBe(100);
        expect(cfg.maxSlippagePercent).toBe(0.05);
        expect(cfg.txCostInQuote).toBe(0.0002);
        expect(cfg.logLevel).toBe('info');
    });
});

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

describe('loadConfig — env vars', () => {
    it('should read mintA and mintB from env', () => {
        const cleanup = withEnv({ MINT_A: VALID_MINT_A, MINT_B: VALID_MINT_B });
        const cfg = loadConfig();
        expect(cfg.mintA).toBe(VALID_MINT_A);
        expect(cfg.mintB).toBe(VALID_MINT_B);
        cleanup();
    });

    it('should parse integer env vars correctly', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            POLLING_INTERVAL_MS: '3000',
        });
        const cfg = loadConfig();
        expect(cfg.pollingIntervalMs).toBe(3000);
        cleanup();
    });

    it('should parse float env vars correctly', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            MIN_PROFIT_THRESHOLD: '0.05',
            TRADE_SIZE: '500',
            MAX_SLIPPAGE_PERCENT: '0.1',
            TX_COST_IN_QUOTE: '0.001',
        });
        const cfg = loadConfig();
        expect(cfg.minProfitThreshold).toBe(0.05);
        expect(cfg.tradeSize).toBe(500);
        expect(cfg.maxSlippagePercent).toBe(0.1);
        expect(cfg.txCostInQuote).toBe(0.001);
        cleanup();
    });

    it('should read logLevel from env', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            LOG_LEVEL: 'debug',
        });
        const cfg = loadConfig();
        expect(cfg.logLevel).toBe('debug');
        cleanup();
    });

    it('should ignore empty string env vars and fall back to defaults', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            POLLING_INTERVAL_MS: '',
            TRADE_SIZE: '',
        });
        const cfg = loadConfig();
        expect(cfg.pollingIntervalMs).toBe(2000);
        expect(cfg.tradeSize).toBe(100);
        cleanup();
    });

    it('should ignore non-numeric env vars and fall back to defaults', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            POLLING_INTERVAL_MS: 'not-a-number',
        });
        const cfg = loadConfig();
        expect(cfg.pollingIntervalMs).toBe(2000);
        cleanup();
    });
});

// ---------------------------------------------------------------------------
// CLI overrides (highest priority)
// ---------------------------------------------------------------------------

describe('loadConfig — CLI overrides', () => {
    it('should prefer CLI overrides over env vars', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            POLLING_INTERVAL_MS: '5000',
        });
        const cfg = loadConfig({ pollingIntervalMs: 1000 });
        expect(cfg.pollingIntervalMs).toBe(1000);
        cleanup();
    });

    it('should merge CLI overrides with env vars', () => {
        const cleanup = withEnv({
            MINT_A: VALID_MINT_A,
            MINT_B: VALID_MINT_B,
            LOG_LEVEL: 'warn',
        });
        const cfg = loadConfig({ tradeSize: 250 });
        expect(cfg.tradeSize).toBe(250);   // from CLI
        expect(cfg.logLevel).toBe('warn'); // from env
        cleanup();
    });

    it('should allow CLI to override rpcUrl', () => {
        const customRpc = 'https://custom-rpc.example.com';
        const cfg = loadConfig({
            mintA: VALID_MINT_A,
            mintB: VALID_MINT_B,
            rpcUrl: customRpc,
        });
        expect(cfg.rpcUrl).toBe(customRpc);
    });
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('loadConfig — validation errors', () => {
    it('should throw a readable error when mintA is missing', () => {
        expect(() => loadConfig({ mintB: VALID_MINT_B })).toThrow('Configuration is invalid');
    });

    it('should throw a readable error when mintB is missing', () => {
        expect(() => loadConfig({ mintA: VALID_MINT_A })).toThrow('Configuration is invalid');
    });

    it('should throw when pollingIntervalMs is below 500', () => {
        expect(() =>
            loadConfig({ mintA: VALID_MINT_A, mintB: VALID_MINT_B, pollingIntervalMs: 100 }),
        ).toThrow('Configuration is invalid');
    });

    it('should include field path in error message', () => {
        try {
            loadConfig({ mintA: VALID_MINT_A, mintB: VALID_MINT_B, pollingIntervalMs: 100 });
        } catch (e) {
            expect((e as Error).message).toContain('pollingIntervalMs');
        }
    });

    it('should throw when tradeSize is zero', () => {
        expect(() =>
            loadConfig({ mintA: VALID_MINT_A, mintB: VALID_MINT_B, tradeSize: 0 }),
        ).toThrow('Configuration is invalid');
    });

    it('should throw when rpcUrl is not a valid URL', () => {
        expect(() =>
            loadConfig({ mintA: VALID_MINT_A, mintB: VALID_MINT_B, rpcUrl: 'not-a-url' }),
        ).toThrow('Configuration is invalid');
    });
});