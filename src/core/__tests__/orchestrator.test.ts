// core/__tests__/orchestrator.test.ts
/**
 * Unit tests for ArbitrageOrchestrator public API.
 * RPC client and pool discovery are mocked — no network calls are made.
 */

import { ArbitrageOrchestrator } from '../orchestrator';
import { SolanaRpcClient } from '../../solana/client';

jest.mock('../../solana/client');
jest.mock('../../solana/poolDiscovery', () => ({
  findPoolsForPair: jest.fn(),
  refreshPoolReserves: jest.fn(),
}));
jest.mock('../../ui/renderer', () => ({
  Renderer: jest.fn().mockImplementation(() => ({
    renderConnecting: jest.fn(),
    renderConnected: jest.fn(),
    render: jest.fn(),
    renderError: jest.fn(),
  })),
}));

import { findPoolsForPair, refreshPoolReserves } from '../../solana/poolDiscovery';

// Valid base58 Solana addresses used as stand-in pool addresses in tests.
const POOL_1 = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const POOL_2 = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bsB';

const BASE_CONFIG = {
  rpcUrl: 'http://mock-rpc',
  mintA: 'So11111111111111111111111111111111111111112',
  mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  pollingIntervalMs: 1000,
  minProfitThreshold: 0.1,
  tradeSize: 100,
  maxSlippagePercent: 0.01,
  txCostInQuote: 0.001,
  logLevel: 'error' as const,
};

const MOCK_POOLS = [
  {
    address: POOL_1,
    tokenA: BASE_CONFIG.mintA,
    tokenB: BASE_CONFIG.mintB,
    reserveA: 1_000_000_000n,
    reserveB: 1_000_000_000n,
    decimalsA: 9,
    decimalsB: 6,
    feeBps: 25,
  },
  {
    address: POOL_2,
    tokenA: BASE_CONFIG.mintA,
    tokenB: BASE_CONFIG.mintB,
    reserveA: 1_000_000_000n,
    reserveB: 1_050_000_000n,
    decimalsA: 9,
    decimalsB: 6,
    feeBps: 25,
  },
];

describe('ArbitrageOrchestrator', () => {
  let mockRpcClient: jest.Mocked<SolanaRpcClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRpcClient = new SolanaRpcClient('http://mock-rpc') as jest.Mocked<SolanaRpcClient>;
    mockRpcClient.healthCheck.mockResolvedValue(true);
    mockRpcClient.getRpcUrl.mockReturnValue('http://mock-rpc');
    mockRpcClient.getMultipleAccounts.mockResolvedValue(new Map());

    (SolanaRpcClient as jest.MockedClass<typeof SolanaRpcClient>)
      .mockImplementation(() => mockRpcClient);

    // Default: discovery returns two pools, refresh returns same pools
    (findPoolsForPair as jest.Mock).mockResolvedValue(MOCK_POOLS);
    (refreshPoolReserves as jest.Mock).mockResolvedValue(MOCK_POOLS);
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('should start with isRunning = false', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      expect(orchestrator.getState().isRunning).toBe(false);
    });

    it('should start with zero counters', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      const state = orchestrator.getState();
      expect(state.totalUpdates).toBe(0);
      expect(state.totalOpportunities).toBe(0);
      expect(state.poolsFound).toBe(0);
    });

    it('should return empty opportunities before first cycle', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      expect(orchestrator.getLastOpportunities()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // start()
  // ---------------------------------------------------------------------------

  describe('start()', () => {
    it('should not start if pool discovery returns no pools', async () => {
      (findPoolsForPair as jest.Mock).mockResolvedValue([]);

      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();

      expect(orchestrator.getState().isRunning).toBe(false);
    });

    it('should set isRunning = true after successful discovery', async () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();

      expect(orchestrator.getState().isRunning).toBe(true);
      expect(orchestrator.getState().poolsFound).toBe(MOCK_POOLS.length);

      orchestrator.stop();
    });

    it('should not start twice if already running', async () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();
      expect(orchestrator.getState().isRunning).toBe(true);

      // Second start() call should be a no-op
      await orchestrator.start();
      expect(findPoolsForPair).toHaveBeenCalledTimes(1);

      orchestrator.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // stop()
  // ---------------------------------------------------------------------------

  describe('stop()', () => {
    it('should set isRunning to false', async () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();
      orchestrator.stop();

      expect(orchestrator.getState().isRunning).toBe(false);
    });

    it('should be safe to call stop() when not running', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      expect(() => orchestrator.stop()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getState()
  // ---------------------------------------------------------------------------

  describe('getState()', () => {
    it('should return a copy, not a reference', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      const state1 = orchestrator.getState();
      const state2 = orchestrator.getState();
      expect(state1).not.toBe(state2);
    });
  });

  // ---------------------------------------------------------------------------
  // getLastOpportunities()
  // ---------------------------------------------------------------------------

  describe('getLastOpportunities()', () => {
    it('should return a copy of the opportunities array', () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      const opps1 = orchestrator.getLastOpportunities();
      const opps2 = orchestrator.getLastOpportunities();
      expect(opps1).not.toBe(opps2);
    });
  });

  // ---------------------------------------------------------------------------
  // refreshPoolReserves integration
  // ---------------------------------------------------------------------------

  describe('refreshPoolReserves', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call refreshPoolReserves on each update cycle', async () => {
      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();

      // Wait for at least one polling cycle
      await jest.advanceTimersByTimeAsync(BASE_CONFIG.pollingIntervalMs);
      orchestrator.stop();

      expect(refreshPoolReserves).toHaveBeenCalled();
      expect(refreshPoolReserves).toHaveBeenCalledWith(
        MOCK_POOLS,
        mockRpcClient,
        BASE_CONFIG.mintA,
        BASE_CONFIG.mintB,
      );
    });

    it('should stop update cycle when refreshPoolReserves returns empty array', async () => {
      (refreshPoolReserves as jest.Mock).mockResolvedValue([]);

      const orchestrator = new ArbitrageOrchestrator(BASE_CONFIG);
      await orchestrator.start();

      await jest.advanceTimersByTimeAsync(BASE_CONFIG.pollingIntervalMs);
      orchestrator.stop();

      // poolsFound should reflect the empty refresh result
      expect(orchestrator.getState().totalUpdates).toBe(0);
    });
  });
});