import { PublicKey } from '@solana/web3.js';
import { 
  isSwapEnabled, 
  readVaultBalance, 
  parseAmmConfigFee, 
  isValidCpmmPoolAccount,
  buildRawPool
} from '../parsers';
import { RAYDIUM_CPMM_PROGRAM_ID, CPMM_POOL_ACCOUNT_SIZE, SPL_TOKEN_AMOUNT_OFFSET } from '../constants';

describe('parsers.ts', () => {
  const mockAddress = new PublicKey('11111111111111111111111111111111');

  describe('isSwapEnabled', () => {
    it('should return true if swap bit is not set', () => {
      expect(isSwapEnabled({ status: 0 } as any)).toBe(true);
      expect(isSwapEnabled({ status: 2 } as any)).toBe(true); // other bits
    });

    it('should return false if swap bit is set (bit 2 = value 4)', () => {
      // Based on constants.ts: SWAP_DISABLED: 4 (0b100)
      expect(isSwapEnabled({ status: 4 } as any)).toBe(false);
      expect(isSwapEnabled({ status: 7 } as any)).toBe(false);
    });
  });

  describe('readVaultBalance', () => {
    it('should correctly read 64-bit LE bigint from offset 64', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 8);
      const expectedAmount = 1234567890n;
      data.writeBigUInt64LE(expectedAmount, SPL_TOKEN_AMOUNT_OFFSET);
      
      const accountInfo = {
        data,
        owner: PublicKey.default,
        executable: false,
        lamports: 0
      };

      expect(readVaultBalance(accountInfo)).toBe(expectedAmount);
    });

    it('should return null if buffer too small', () => {
      const data = Buffer.alloc(SPL_TOKEN_AMOUNT_OFFSET + 7);
      const accountInfo = { data } as any;
      expect(readVaultBalance(accountInfo)).toBeNull();
    });
  });

  describe('parseAmmConfigFee', () => {
    it('should correctly parse fee rate from offset 12', () => {
      const data = Buffer.alloc(20);
      const feeRateRaw = 2500n; // 0.25% = 25 bps
      data.writeBigUInt64LE(feeRateRaw, 12);
      
      const accountInfo = { data } as any;
      expect(parseAmmConfigFee(accountInfo)).toBe(25);
    });

    it('should return default fee if buffer too small', () => {
      const data = Buffer.alloc(19);
      const accountInfo = { data } as any;
      expect(parseAmmConfigFee(accountInfo)).toBe(25); // DEFAULT_FEE_BPS = 25
    });
  });

  describe('isValidCpmmPoolAccount', () => {
    it('should return true for valid account', () => {
      const accountInfo = {
        executable: false,
        owner: RAYDIUM_CPMM_PROGRAM_ID,
        data: Buffer.alloc(CPMM_POOL_ACCOUNT_SIZE)
      } as any;
      expect(isValidCpmmPoolAccount(accountInfo)).toBe(true);
    });

    it('should return false if owner is wrong', () => {
      const accountInfo = {
        executable: false,
        owner: PublicKey.default,
        data: Buffer.alloc(CPMM_POOL_ACCOUNT_SIZE)
      } as any;
      expect(isValidCpmmPoolAccount(accountInfo)).toBe(false);
    });
  });

  describe('buildRawPool', () => {
    const mockDecoded = {
      mintA: new PublicKey('So11111111111111111111111111111111111111112'),
      mintB: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      mintDecimalA: 9,
      mintDecimalB: 6
    };

    it('should build RawPool if tokens match and reserves > 0', () => {
      const pool = buildRawPool(
        'pool_addr',
        mockDecoded as any,
        1000n,
        2000n,
        25,
        mockDecoded.mintA.toString(),
        mockDecoded.mintB.toString()
      );
      expect(pool).not.toBeNull();
      expect(pool?.address).toBe('pool_addr');
      expect(pool?.reserveA).toBe(1000n);
    });

    it('should return null if tokens mismatch', () => {
      const pool = buildRawPool(
        'pool_addr',
        mockDecoded as any,
        1000n,
        2000n,
        25,
        mockDecoded.mintA.toString(),
        PublicKey.default.toString()
      );
      expect(pool).toBeNull();
    });

    it('should return null if reserves are zero', () => {
      const pool = buildRawPool(
        'pool_addr',
        mockDecoded as any,
        0n,
        2000n,
        25,
        mockDecoded.mintA.toString(),
        mockDecoded.mintB.toString()
      );
      expect(pool).toBeNull();
    });
  });
});
