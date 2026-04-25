import { ArbitrageOrchestrator } from '../orchestrator';
import { SolanaRpcClient } from '../../solana/client';
import { PublicKey } from '@solana/web3.js';

// Mock the RPC client
jest.mock('../../solana/client');

describe('Orchestrator Integration', () => {
  let mockRpcClient: jest.Mocked<SolanaRpcClient>;
  let orchestrator: ArbitrageOrchestrator;

  const mintA = 'So11111111111111111111111111111111111111112';
  const mintB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  beforeEach(() => {
    jest.clearAllMocks();

    mockRpcClient = new SolanaRpcClient('http://mock-rpc') as jest.Mocked<SolanaRpcClient>;
    
    // Default health check passes
    mockRpcClient.healthCheck.mockResolvedValue(true);

    orchestrator = new ArbitrageOrchestrator({
      rpcUrl: 'http://mock-rpc',
      mintA,
      mintB,
      quoteMint: mintB,
      pollingIntervalMs: 1000,
      minProfitThreshold: 0.1,
      tradeSize: 100,
      maxSlippagePercent: 0.01,
      txCostInQuote: 0.001,
      logLevel: 'error',
      logToFile: false,
      maxOpportunitiesDisplay: 5,
      showSlippage: true,
      maxPoolsToMonitor: 10,
      rpcRetries: 1,
      rpcRetryDelayMs: 100,
    });

    // Inject the mock client
    (orchestrator as any).rpcClient = mockRpcClient;
  });

  it('should run a full discovery and update cycle', async () => {
    // 1. Mock getProgramAccounts (Discovery Stage 1)
    const mockPoolAddr1 = new PublicKey('7Juw7uWzdnywGf7K7mJv6G87H9H9H9H9H9H9H9H9H9H9');
    const mockPoolAddr2 = new PublicKey('8Kvx8vXxeozxHg8L8nKxB8H8H8H8H8H8H8H8H8H8H8H8');
    
    mockRpcClient.getProgramAccounts.mockResolvedValue([
      {
        publicKey: mockPoolAddr1,
        account: {
          data: Buffer.alloc(1000),
          executable: false,
          lamports: 1000,
          owner: new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
        } as any,
      },
      {
        publicKey: mockPoolAddr2,
        account: {
          data: Buffer.alloc(1000),
          executable: false,
          lamports: 1000,
          owner: new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
        } as any,
      },
    ]);

    // 2. Mock responses for vaults and config
    const vaultA = new PublicKey('A'.repeat(44));
    const vaultB = new PublicKey('B'.repeat(44));
    const configId = new PublicKey('C'.repeat(44));

    // Mock parsers because building a binary Buffer for SDK layouts is tedious
    const parsers = require('../../solana/parsers');
    const originalDecode = parsers.decodePoolState;
    parsers.decodePoolState = jest.fn().mockReturnValue({
      mintA: new PublicKey(mintA),
      mintB: new PublicKey(mintB),
      vaultA,
      vaultB,
      configId,
      mintDecimalA: 9,
      mintDecimalB: 6,
      status: 0,
    });

    const mockAccounts = new Map();
    const vaultDataA = Buffer.alloc(128);
    vaultDataA.writeBigUInt64LE(1000_000_000n, 64); // 1 SOL
    const vaultDataB = Buffer.alloc(128);
    vaultDataB.writeBigUInt64LE(20_000_000n, 64); // 20 USDC

    mockAccounts.set(vaultA.toString(), { data: vaultDataA } as any);
    mockAccounts.set(vaultB.toString(), { data: vaultDataB } as any);
    
    // Add second pool's vaults (identical in this simplified mock)
    mockAccounts.set(vaultA.toString(), { data: vaultDataA } as any);
    mockAccounts.set(vaultB.toString(), { data: vaultDataB } as any);

    const configData = Buffer.alloc(1000);
    // tradeFeeRate is at offset 12 in CpmmConfigInfoLayout
    configData.writeBigUInt64LE(2500n, 12);
    mockAccounts.set(configId.toString(), { data: configData } as any);

    mockRpcClient.getMultipleAccounts.mockResolvedValue(mockAccounts);

    // Run discovery
    const discoveryResult = await (orchestrator as any).discoverPools();
    expect(discoveryResult).toBe(true);
    expect((orchestrator as any).rawPools.length).toBe(2);

    // Run update cycle
    await (orchestrator as any).updateCycle();
    
    // Verify state updates
    const state = (orchestrator as any).state;
    expect(state.totalUpdates).toBe(1);
    expect(mockRpcClient.healthCheck).toHaveBeenCalled();

    // Restore parsers
    parsers.decodePoolState = originalDecode;
  });
});
