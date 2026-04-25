import { ConfigSchema, DEFAULT_VALUES } from '../schema';

describe('config schema', () => {
  const validConfig = {
    mintA: DEFAULT_VALUES.mintA,
    mintB: DEFAULT_VALUES.mintB,
    quoteMint: DEFAULT_VALUES.quoteMint,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  };

  it('should validate valid configuration', () => {
    const result = ConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pollingIntervalMs).toBe(2000); // Check default value
    }
  });

  it('should fail on invalid RPC URL', () => {
    const result = ConfigSchema.safeParse({
      ...validConfig,
      rpcUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('should fail on invalid Solana address', () => {
    const result = ConfigSchema.safeParse({
      ...validConfig,
      mintA: 'invalid-address',
    });
    expect(result.success).toBe(false);
  });

  it('should fail on negative polling interval', () => {
    const result = ConfigSchema.safeParse({
      ...validConfig,
      pollingIntervalMs: -100,
    });
    expect(result.success).toBe(false);
  });

  it('should fail on invalid slippage (too high)', () => {
    const result = ConfigSchema.safeParse({
      ...validConfig,
      maxSlippagePercent: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('should fail on invalid log level', () => {
    const result = ConfigSchema.safeParse({
      ...validConfig,
      logLevel: 'super-debug',
    });
    expect(result.success).toBe(false);
  });

  it('should apply default values for missing fields', () => {
    const result = ConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.txCostInQuote).toBe(0.0002);
      expect(result.data.logToFile).toBe(true);
    }
  });
});
