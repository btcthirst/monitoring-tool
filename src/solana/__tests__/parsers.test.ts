// solana/__tests__/parsers.test.ts

import { PublicKey } from '@solana/web3.js';
import {
  isSwapEnabled,
  readVaultBalance,
  parseAmmConfigFee,
  buildRawPool,
} from '../parsers';
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  CPMM_POOL_ACCOUNT_SIZE,
  SPL_TOKEN_AMOUNT_OFFSET,
  DEFAULT_FEE_BPS,
} from '../constants';

const MINT_A = 'So11111111111111111111111111111111111111112';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('parsers.ts', () => {
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

    it('should return false when swap bit is set alongside other bits', () => {
      expect(isSwapEnabled({ status: 5 } as any)).toBe(false); // 0b101
      expect(isSwapEnabled({ status: 6 } as any)).toBe(false); // 0b110
      expect(isSwapEnabled({ status: 7 } as any)).toBe(false); // 0b111
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

    it('should correctly read zero balance', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 8);
      data.writeBigUInt64LE(0n, SPL_TOKEN_AMOUNT_OFFSET);

      expect(readVaultBalance({ data } as any)).toBe(0n);
    });

    it('should correctly read max uint64 value', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 8);
      const maxU64 = 18_446_744_073_709_551_615n;
      data.writeBigUInt64LE(maxU64, SPL_TOKEN_AMOUNT_OFFSET);

      expect(readVaultBalance({ data } as any)).toBe(maxU64);
    });

    it('should return null if buffer is too small (exactly 1 byte short)', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 7);
      expect(readVaultBalance({ data } as any)).toBeNull();
    });

    it('should return null if buffer is empty', () => {
      const data = Buffer.alloc(0);
      expect(readVaultBalance({ data } as any)).toBeNull();
    });
  });

  describe('parseAmmConfigFee()', () => {
    it('should correctly parse fee rate from a valid buffer', () => {
      const data = Buffer.alloc(300);
      // tradeFeeRate at offset 12 in CpmmConfigInfoLayout
      data.writeBigUInt64LE(2500n, 12); // 2500 / 100 = 25 bps

      expect(parseAmmConfigFee({ data } as any)).toBe(25);
    });

    it('should return DEFAULT_FEE_BPS when fee rate is 0', () => {
      const data = Buffer.alloc(300);
      data.writeBigUInt64LE(0n, 12);

      expect(parseAmmConfigFee({ data } as any)).toBe(DEFAULT_FEE_BPS);
    });

    it('should return DEFAULT_FEE_BPS on decode failure', () => {
      const data = Buffer.alloc(0); // too small to decode
      expect(parseAmmConfigFee({ data } as any)).toBe(DEFAULT_FEE_BPS);
    });

    it('should parse non-standard fee rates correctly', () => {
      const data = Buffer.alloc(300);
      data.writeBigUInt64LE(1000n, 12); // 1000 / 100 = 10 bps = 0.1%

      expect(parseAmmConfigFee({ data } as any)).toBe(10);
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
      expect(pool!.tokenA).toBe(MINT_A);
      expect(pool!.tokenB).toBe(MINT_B);
      expect(pool!.reserveA).toBe(1_000_000_000n);
      expect(pool!.reserveB).toBe(2_000_000n);
      expect(pool!.decimalsA).toBe(9);
      expect(pool!.decimalsB).toBe(6);
      expect(pool!.feeBps).toBe(25);
    });

    it('should return null when token pair does not match', () => {
      const wrongMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        1_000_000_000n,
        2_000_000n,
        25,
        MINT_A,
        wrongMint,
      );

      expect(pool).toBeNull();
    });

    it('should return null when reserveA is zero', () => {
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

    it('should return null when reserveB is zero', () => {
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        1_000_000_000n,
        0n,
        25,
        MINT_A,
        MINT_B,
      );

      expect(pool).toBeNull();
    });

    it('should accept mints in reversed order (pair symmetry)', () => {
      const pool = buildRawPool(
        'poolAddress123',
        mockDecoded as any,
        1_000_000_000n,
        2_000_000n,
        25,
        MINT_B, // reversed
        MINT_A, // reversed
      );

      expect(pool).not.toBeNull();
    });
  });
});