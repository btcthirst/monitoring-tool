// config/__tests__/schema.test.ts

import { ConfigSchema } from '../schema';

const VALID_MINT_A = 'So11111111111111111111111111111111111111112';
const VALID_MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const MINIMAL_VALID = {
  mintA: VALID_MINT_A,
  mintB: VALID_MINT_B,
  quoteMint: VALID_MINT_B,
};

describe('ConfigSchema', () => {
  describe('valid input', () => {
    it('should parse minimal config with defaults applied', () => {
      const result = ConfigSchema.parse(MINIMAL_VALID);

      expect(result.mintA).toBe(VALID_MINT_A);
      expect(result.mintB).toBe(VALID_MINT_B);
      expect(result.quoteMint).toBe(VALID_MINT_B);
      expect(result.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
      expect(result.pollingIntervalMs).toBe(2000);
      expect(result.minProfitThreshold).toBe(0.01);
      expect(result.tradeSize).toBe(100);
      expect(result.maxSlippagePercent).toBe(0.05);
      expect(result.txCostInQuote).toBe(0.0002);
      expect(result.logLevel).toBe('info');
    });

    it('should accept all log levels', () => {
      const levels = ['error', 'warn', 'info', 'http', 'debug'] as const;
      for (const logLevel of levels) {
        const result = ConfigSchema.parse({ ...MINIMAL_VALID, logLevel });
        expect(result.logLevel).toBe(logLevel);
      }
    });

    it('should accept custom numeric values', () => {
      const result = ConfigSchema.parse({
        ...MINIMAL_VALID,
        pollingIntervalMs: 5000,
        minProfitThreshold: 1.5,
        tradeSize: 500,
        maxSlippagePercent: 0.1,
        txCostInQuote: 0.001,
      });

      expect(result.pollingIntervalMs).toBe(5000);
      expect(result.minProfitThreshold).toBe(1.5);
      expect(result.tradeSize).toBe(500);
      expect(result.maxSlippagePercent).toBe(0.1);
      expect(result.txCostInQuote).toBe(0.001);
    });

    it('should accept a custom rpcUrl', () => {
      const result = ConfigSchema.parse({
        ...MINIMAL_VALID,
        rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=abc123',
      });
      expect(result.rpcUrl).toBe('https://mainnet.helius-rpc.com/?api-key=abc123');
    });

    it('should accept minProfitThreshold of 0', () => {
      const result = ConfigSchema.parse({ ...MINIMAL_VALID, minProfitThreshold: 0 });
      expect(result.minProfitThreshold).toBe(0);
    });
  });

  describe('invalid mint addresses', () => {
    it('should reject empty mintA', () => {
      expect(() => ConfigSchema.parse({ ...MINIMAL_VALID, mintA: '' })).toThrow();
    });

    it('should reject mintA with invalid characters', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, mintA: 'not-a-valid-base58-address!!' }),
      ).toThrow();
    });

    it('should reject mintA that is too short', () => {
      expect(() => ConfigSchema.parse({ ...MINIMAL_VALID, mintA: 'abc' })).toThrow();
    });

    it('should reject missing mintA', () => {
      const { mintA: _, ...rest } = MINIMAL_VALID;
      expect(() => ConfigSchema.parse(rest)).toThrow();
    });

    it('should reject missing mintB', () => {
      const { mintB: _, ...rest } = MINIMAL_VALID;
      expect(() => ConfigSchema.parse(rest)).toThrow();
    });
  });

  describe('invalid numeric values', () => {
    it('should reject pollingIntervalMs below 500', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, pollingIntervalMs: 499 }),
      ).toThrow();
    });

    it('should reject pollingIntervalMs of 0', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, pollingIntervalMs: 0 }),
      ).toThrow();
    });

    it('should reject negative minProfitThreshold', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, minProfitThreshold: -1 }),
      ).toThrow();
    });

    it('should reject tradeSize of 0', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, tradeSize: 0 }),
      ).toThrow();
    });

    it('should reject negative tradeSize', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, tradeSize: -100 }),
      ).toThrow();
    });

    it('should reject maxSlippagePercent above 1', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, maxSlippagePercent: 1.1 }),
      ).toThrow();
    });

    it('should reject maxSlippagePercent of 0', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, maxSlippagePercent: 0 }),
      ).toThrow();
    });
  });

  describe('invalid rpcUrl', () => {
    it('should reject a non-URL string', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, rpcUrl: 'not-a-url' }),
      ).toThrow();
    });

    it('should reject an empty rpcUrl', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, rpcUrl: '' }),
      ).toThrow();
    });
  });

  describe('invalid logLevel', () => {
    it('should reject unknown log level', () => {
      expect(() =>
        ConfigSchema.parse({ ...MINIMAL_VALID, logLevel: 'verbose' }),
      ).toThrow();
    });
  });
});