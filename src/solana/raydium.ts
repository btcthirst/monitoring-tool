// solana/raydium.ts
/**
 * Raydium CPMM specific logic via SDK v2.
 *
 * SDK provides:
 * - getPdaPoolId() — pool address derivation
 * - getPdaPoolVaultId() — vault address derivation
 * - computeAmountIn/Out — swap simulation (used for verification)
 */

import { PublicKey } from '@solana/web3.js';
import {
  getPdaPoolId,
  getPdaPoolVaultId,
  getPdaLpMint,
  DEVNET_PROGRAM_ID,
} from '@raydium-io/raydium-sdk-v2';
import { RAYDIUM_CPMM_PROGRAM_ID, POOL_STATUS_BITS } from './constants';

// ---------------------------------------------------------------------------
// PDA Derivation via SDK
// ---------------------------------------------------------------------------

// Note: Direct PDA derivation is currently handled internally by SDK v2
// or by specific logic in poolDiscovery.ts. These helpers are kept for
// potential future use or documentation of the SDK capabilities.
// Actually, they are unused in the current project flow.