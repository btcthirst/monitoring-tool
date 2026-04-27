// solana/__tests__/parsers.test.ts

import { PublicKey } from '@solana/web3.js';
import {
  isSwapEnabled,
  readVaultBalance,
  parseAmmConfigFee,
  buildRawPool,
  decodePoolState,
} from '../parsers';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  SPL_TOKEN_AMOUNT_OFFSET,
  DEFAULT_FEE_BPS,
} from '../constants';

import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2';

const MINT_A = 'So11111111111111111111111111111111111111112';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('parsers.ts', () => {
  describe('decodePoolState()', () => {
    it('should return null if owner is not Raydium CPMM', () => {
        const accountInfo = {
            owner: PublicKey.unique(),
            data: Buffer.alloc(CPMM_POOL_ACCOUNT_SIZE),
        };
        expect(decodePoolState(PublicKey.unique(), accountInfo as any)).toBeNull();
    });

    it('should return null if data size is too small', () => {
        const accountInfo = {
            owner: RAYDIUM_CPMM_PROGRAM_ID,
            data: Buffer.alloc(CPMM_POOL_ACCOUNT_SIZE - 1),
        };
        expect(decodePoolState(PublicKey.unique(), accountInfo as any)).toBeNull();
    });

    it('should return null if SDK decode fails', () => {
        const accountInfo = {
            owner: RAYDIUM_CPMM_PROGRAM_ID,
            data: Buffer.alloc(CPMM_POOL_ACCOUNT_SIZE),
        };
        // Spy on decode and make it throw
        const spy = jest.spyOn(CpmmPoolInfoLayout, 'decode').mockImplementationOnce(() => {
            throw new Error('decode failed');
        });
        expect(decodePoolState(PublicKey.unique(), accountInfo as any)).toBeNull();
        spy.mockRestore();
    });
  });

  describe('isSwapEnabled()', () => {
    it('should return true when status is 0 (all operations enabled)', () => {
      expect(isSwapEnabled({ status: 0 } as any)).toBe(true);
    });

    it('should return true when only deposit/withdraw bits are set', () => {
      expect(isSwapEnabled({ status: 1 } as any)).toBe(true); // deposit disabled
      expect(isSwapEnabled({ status: 2 } as any)).toBe(true); // withdraw disabled
      expect(isSwapEnabled({ status: 3 } as any)).toBe(true); // both disabled
    });

    it('should return false when swap bit (4) is set', () => {
      expect(isSwapEnabled({ status: 4 } as any)).toBe(false);
    });
  });

  describe('readVaultBalance()', () => {
    it('should correctly read a 64-bit LE bigint from offset 64', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 8);
      const expectedAmount = 1_234_567_890n;
      data.writeBigUInt64LE(expectedAmount, SPL_TOKEN_AMOUNT_OFFSET);

      const accountInfo = {
        data,
        owner: PublicKey.default,
        executable: false,
        lamports: 0,
      };

      expect(readVaultBalance(accountInfo as any)).toBe(expectedAmount);
    });

    it('should return null if buffer is too small', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 7);
      expect(readVaultBalance({ data } as any)).toBeNull();
    });

    it('should return null if readBigUInt64LE fails unexpectedly', () => {
        const data = {
            length: 100,
            readBigUInt64LE: () => { throw new Error('mock error'); }
        };
        expect(readVaultBalance({ data } as any)).toBeNull();
    });
  });

  describe('parseAmmConfigFee()', () => {
    it('should correctly parse fee rate from a valid buffer', () => {
      const data = Buffer.alloc(300);
      data.writeBigUInt64LE(2500n, 12); // 25 bps
      expect(parseAmmConfigFee({ data } as any)).toBe(25);
    });

    it('should return DEFAULT_FEE_BPS on decode failure', () => {
      const data = Buffer.alloc(0);
      expect(parseAmmConfigFee({ data } as any)).toBe(DEFAULT_FEE_BPS);
    });
  });

  describe('buildRawPool()', () => {
    const mockDecoded = {
      mintA: new PublicKey(MINT_A),
      mintB: new PublicKey(MINT_B),
      mintDecimalA: 9,
      mintDecimalB: 6,
    };

    it('should build a valid RawPool from correct inputs', () => {
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        1_000_000_000n,
        2_000_000n,
        25,
        MINT_A,
        MINT_B,
      );

      expect(pool).not.toBeNull();
      expect(pool!.address).toBe('poolAddress123');
    });

    it('should return null when token pair does not match', () => {
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        1_000_000_000n,
        2_000_000n,
        25,
        MINT_A,
        'wrongMint',
      );
      expect(pool).toBeNull();
    });

    it('should return null when reserve is zero', () => {
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        0n,
        2_000_000n,
        25,
        MINT_A,
        MINT_B,
      );
      expect(pool).toBeNull();
    });
  });
});