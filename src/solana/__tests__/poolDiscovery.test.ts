// solana/__tests__/poolDiscovery.test.ts

import { PublicKey } from '@solana/web3.js';

// Mock Raydium SDK BEFORE importing poolDiscovery
jest.mock('@raydium-io/raydium-sdk-v2', () => ({
  __esModule: true,
  CpmmPoolInfoLayout: {
    offsetOf: jest.fn((key) => {
      if (key === 'mintA') return 168;
      if (key === 'mintB') return 200;
      return 0;
    }),
  },
  CpmmConfigInfoLayout: {
    offsetOf: jest.fn(() => 0),
  },
}));

import { findPoolsForPair, buildPoolFilters } from '../poolDiscovery';
import { SolanaRpcClient } from '../client';
import * as parsers from '../parsers';

// Mock SolanaRpcClient
jest.mock('../client');
// Mock parsers to control decoding logic
jest.mock('../parsers');

describe('poolDiscovery.ts', () => {
  const MINT_A = 'So11111111111111111111111111111111111111112';
  const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  let mockRpcClient: jest.Mocked<SolanaRpcClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRpcClient = new SolanaRpcClient('http://localhost') as jest.Mocked<SolanaRpcClient>;
    
    (parsers.decodePoolState as jest.Mock).mockReset();
    (parsers.isSwapEnabled as jest.Mock).mockReset();
    (parsers.readVaultBalance as jest.Mock).mockReset();
    (parsers.parseAmmConfigFee as jest.Mock).mockReset();
    (parsers.buildRawPool as jest.Mock).mockReset();
  });

  describe('buildPoolFilters()', () => {
    it('should build filters with correct size and offsets', () => {
      const filters = buildPoolFilters(MINT_A, MINT_B);
      expect(filters).toHaveLength(3);
      expect(filters[0]).toEqual({ dataSize: 637 }); // CPMM_POOL_ACCOUNT_SIZE
      expect((filters[1] as any).memcmp.offset).toBe(168); // mintA offset
      expect((filters[2] as any).memcmp.offset).toBe(200); // mintB offset
    });
  });

  describe('findPoolsForPair()', () => {
    it('should return empty array if no accounts found', async () => {
      mockRpcClient.getProgramAccounts.mockResolvedValue([]);
      const pools = await findPoolsForPair(mockRpcClient, MINT_A, MINT_B, false);
      expect(pools).toEqual([]);
      expect(mockRpcClient.getProgramAccounts).toHaveBeenCalledTimes(1);
    });

    it('should discover and assemble pools successfully', async () => {
      const poolAddr = PublicKey.unique();
      const vaultA = PublicKey.unique();
      const vaultB = PublicKey.unique();
      const configId = PublicKey.unique();

      const mockRawAccount = {
        publicKey: poolAddr,
        account: { data: Buffer.from('pool_data') } as any,
      };

      const mockState = {
        vaultA,
        vaultB,
        configId,
        status: 0,
      };

      const mockVaultInfo = { data: Buffer.alloc(100) } as any;

      mockRpcClient.getProgramAccounts.mockResolvedValue([mockRawAccount]);
      (parsers.decodePoolState as jest.Mock).mockReturnValue(mockState);
      (parsers.isSwapEnabled as jest.Mock).mockReturnValue(true);
      
      const accountsMap = new Map();
      accountsMap.set(vaultA.toString(), mockVaultInfo);
      accountsMap.set(vaultB.toString(), mockVaultInfo);
      accountsMap.set(configId.toString(), mockVaultInfo);
      mockRpcClient.getMultipleAccounts.mockResolvedValue(accountsMap);

      (parsers.readVaultBalance as jest.Mock).mockReturnValue(1000n);
      (parsers.parseAmmConfigFee as jest.Mock).mockReturnValue(25);
      (parsers.buildRawPool as jest.Mock).mockReturnValue({ address: poolAddr.toString() });

      const pools = await findPoolsForPair(mockRpcClient, MINT_A, MINT_B, false);

      expect(pools).toHaveLength(1);
      expect(pools[0]!.address).toBe(poolAddr.toString());
    });

    it('should skip pools with disabled swap', async () => {
      const poolAddr = PublicKey.unique();
      mockRpcClient.getProgramAccounts.mockResolvedValue([
        { publicKey: poolAddr, account: { data: Buffer.from('data') } as any }
      ]);
      (parsers.decodePoolState as jest.Mock).mockReturnValue({ status: 4 });
      (parsers.isSwapEnabled as jest.Mock).mockReturnValue(false);

      const pools = await findPoolsForPair(mockRpcClient, MINT_A, MINT_B, false);

      expect(pools).toHaveLength(0);
    });

    it('should skip pools with missing vault data', async () => {
      const poolAddr = PublicKey.unique();
      const vaultA = PublicKey.unique();
      const vaultB = PublicKey.unique();

      mockRpcClient.getProgramAccounts.mockResolvedValue([
        { publicKey: poolAddr, account: { data: Buffer.from('data') } as any }
      ]);
      (parsers.decodePoolState as jest.Mock).mockReturnValue({ vaultA, vaultB, configId: PublicKey.unique() });
      (parsers.isSwapEnabled as jest.Mock).mockReturnValue(true);
      
      mockRpcClient.getMultipleAccounts.mockResolvedValue(new Map()); // Missing vaults

      const pools = await findPoolsForPair(mockRpcClient, MINT_A, MINT_B, false);

      expect(pools).toHaveLength(0);
    });

    it('should handle missing config data by using default fee', async () => {
        const poolAddr = PublicKey.unique();
        const vaultA = PublicKey.unique();
        const vaultB = PublicKey.unique();
        mockRpcClient.getProgramAccounts.mockResolvedValue([{ publicKey: poolAddr, account: {} as any }]);
        (parsers.decodePoolState as jest.Mock).mockReturnValue({ vaultA, vaultB, configId: PublicKey.unique() });
        (parsers.isSwapEnabled as jest.Mock).mockReturnValue(true);
        (parsers.readVaultBalance as jest.Mock).mockReturnValue(100n);
        
        mockRpcClient.getMultipleAccounts.mockResolvedValue(new Map([
            [vaultA.toString(), {} as any],
            [vaultB.toString(), {} as any]
        ])); // config missing

        await findPoolsForPair(mockRpcClient, MINT_A, MINT_B, false);
        expect(parsers.buildRawPool).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            100n,
            100n,
            25, // default fee
            MINT_A,
            MINT_B
        );
    });

    it('should use cache on subsequent calls', async () => {
      const UNIQUE_MINT_A = PublicKey.unique().toString();
      const UNIQUE_MINT_B = PublicKey.unique().toString();
      
      const poolAddr = PublicKey.unique();
      const vaultA = PublicKey.unique();
      const vaultB = PublicKey.unique();
      const configId = PublicKey.unique();

      mockRpcClient.getProgramAccounts.mockResolvedValue([{ publicKey: poolAddr, account: {} as any }]);
      (parsers.decodePoolState as jest.Mock).mockReturnValue({ vaultA, vaultB, configId });
      (parsers.isSwapEnabled as jest.Mock).mockReturnValue(true);
      (parsers.readVaultBalance as jest.Mock).mockReturnValue(100n);
      (parsers.buildRawPool as jest.Mock).mockReturnValue({ address: 'cached_pool' });
      
      const accountsMap = new Map();
      accountsMap.set(vaultA.toString(), {} as any);
      accountsMap.set(vaultB.toString(), {} as any);
      accountsMap.set(configId.toString(), {} as any);
      mockRpcClient.getMultipleAccounts.mockResolvedValue(accountsMap);

      // Call 1: Discover and cache
      const pools1 = await findPoolsForPair(mockRpcClient, UNIQUE_MINT_A, UNIQUE_MINT_B, true);
      expect(pools1).toHaveLength(1);
      expect(mockRpcClient.getProgramAccounts).toHaveBeenCalledTimes(1);

      // Call 2: Should use cache
      const pools2 = await findPoolsForPair(mockRpcClient, UNIQUE_MINT_A, UNIQUE_MINT_B, true);
      expect(pools2).toHaveLength(1);
      expect(pools2[0]!.address).toBe('cached_pool');
      expect(mockRpcClient.getProgramAccounts).toHaveBeenCalledTimes(1); // Still 1
    });
  });
});
