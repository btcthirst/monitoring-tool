// solana/__tests__/client.test.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaRpcClient } from '../client';

// Mock Connection
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn(),
  };
});

describe('SolanaRpcClient', () => {
  const mockRpcUrl = 'https://api.mainnet-beta.solana.com';
  let client: SolanaRpcClient;
  let mockConnection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getProgramAccounts: jest.fn(),
      getMultipleAccountsInfo: jest.fn(),
      getSlot: jest.fn(),
    };
    (Connection as jest.Mock).mockImplementation(() => mockConnection);
    client = new SolanaRpcClient(mockRpcUrl);
  });

  describe('initialization', () => {
    it('should initialize with correct URL', () => {
      expect(client.getRpcUrl()).toBe(mockRpcUrl);
      expect(Connection).toHaveBeenCalledWith(mockRpcUrl, expect.any(Object));
    });
  });

  describe('getProgramAccounts', () => {
    it('should fetch program accounts successfully', async () => {
      const programId = new PublicKey('So11111111111111111111111111111111111111112');
      const mockResult = [
        { pubkey: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), account: { data: Buffer.from('data') } },
      ];
      mockConnection.getProgramAccounts.mockResolvedValue(mockResult);

      const results = await client.getProgramAccounts(programId, []);

      expect(results).toHaveLength(1);
      expect(results[0]!.publicKey).toEqual(mockResult[0]!.pubkey);
      expect(mockConnection.getProgramAccounts).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const programId = PublicKey.default;
      mockConnection.getProgramAccounts
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce([]);

      const results = await client.getProgramAccounts(programId, [], { retries: 2 });

      expect(results).toHaveLength(0);
      expect(mockConnection.getProgramAccounts).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const programId = PublicKey.default;
      mockConnection.getProgramAccounts.mockRejectedValue(new Error('Persistent failure'));

      await expect(client.getProgramAccounts(programId, [], { retries: 2 }))
        .rejects.toThrow('RPC call failed after 2 attempts');
    });
  });

  describe('getMultipleAccounts', () => {
    it('should return empty map if no keys provided', async () => {
      const results = await client.getMultipleAccounts([]);
      expect(results.size).toBe(0);
      expect(mockConnection.getMultipleAccountsInfo).not.toHaveBeenCalled();
    });

    it('should fetch multiple accounts with chunking', async () => {
      const keys = Array.from({ length: 150 }, () => PublicKey.unique());
      mockConnection.getMultipleAccountsInfo
        .mockResolvedValueOnce(new Array(100).fill({ data: Buffer.from('1') }))
        .mockResolvedValueOnce(new Array(50).fill({ data: Buffer.from('2') }));

      const results = await client.getMultipleAccounts(keys);

      expect(results.size).toBe(150);
      expect(mockConnection.getMultipleAccountsInfo).toHaveBeenCalledTimes(2);
    });

    it('should handle null accounts', async () => {
      const key = PublicKey.unique();
      mockConnection.getMultipleAccountsInfo.mockResolvedValue([null]);

      const results = await client.getMultipleAccounts([key]);

      expect(results.get(key.toString())).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return true if RPC is healthy', async () => {
      mockConnection.getSlot.mockResolvedValue(123456);
      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false if RPC fails', async () => {
      mockConnection.getSlot.mockRejectedValue(new Error('Offline'));
      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});
