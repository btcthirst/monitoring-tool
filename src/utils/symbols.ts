import { formatNumber } from "./math";

// ---------------------------------------------------------------------------
// Known Mints & Symbols
// ---------------------------------------------------------------------------

const KNOWN_SYMBOLS: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    'mSoLzYSa7mS51vg9UZyfecnmojS3S9cmM9K6MtvPZzY': 'mSOL',
    'jtoSjKiZxTZCFP2SbsCcS9ESGrVkS8AnS4tXN3J46b2': 'JTO',
};

/**
 * Get symbol for a mint address or abbreviated address if unknown.
 */
export function resolveSymbol(mint: string): string {
    return KNOWN_SYMBOLS[mint] || formatAddress(mint, 4, 4);
}

/**
 * Format amount with currency symbol or prefix.
 * Uses $ for USDC/USDT, otherwise appends symbol as suffix.
 */
export function formatCurrency(amount: number, symbol: string, decimals = 2): string {
    const formatted = formatNumber(amount, decimals);
    if (symbol === 'USDC' || symbol === 'USDT') {
        return `$${formatted}`;
    }
    return `${formatted} ${symbol}`;
}
// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * Abbreviate address: first N + last N characters.
 * @example formatAddress('So111...112', 4, 4) -> 'So11...1112'
 */
export function formatAddress(
    address: string,
    startLength = 4,
    endLength = 4,
): string {
    if (address.length <= startLength + endLength) return address;
    return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}