# 📖 Quick Start Guide: From Zero to First Result

This guide walks you through the entire process of setting up and running the Solana Raydium CPMM Arbitrage Monitor.

## 1. Identify Your Token Pair (Mints)

To monitor arbitrage, you need the contract addresses (Mints) of two tokens. For this example, we will use **SOL** and **USDC**.

*   **WSOL (Wrapped SOL):** `So11111111111111111111111111111111111111112`
*   **USDC:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

> [!TIP]
> You can find mint addresses on [Solscan](https://solscan.io/) or [DexScreener](https://dexscreener.com/).

## 2. Configure Your Environment

The easiest way to run the tool is by using a `.env` file.

1.  Create the file: `cp .env.example .env`
2.  Open `.env` and fill in your RPC URL (Helius/QuickNode recommended):
    ```env
    RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
    MINT_A=So11111111111111111111111111111111111111112
    MINT_B=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    QUOTE_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    ```

## 3. Launch the Monitor

Run the following command to start the real-time scanning:

```bash
npm run build
npm run start -- monitor
```

Alternatively, you can skip the `.env` file and pass everything via CLI:

```bash
npm run start -- monitor \
  So11111111111111111111111111111111111111112 \
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --trade-size 1000 \
  --min-profit 0.5
```

## 4. Interpret the Results

Once the monitor is running, you will see a live-updating table. Here is how to read the first result:

```text
╔══════════════╤══════════════╤══════════════╤═══════════╤══════════════╤════════════╤════════╗
║ Buy Pool     │ Sell Pool    │ Net Profit   │ Profit %  │ Gross        │ Slippage   │ Fee    ║
╟──────────────┼──────────────┼──────────────┼───────────┼──────────────┼────────────┼────────╢
║ 8sLb...4k9m  │ 2Poy...7n2x  │ +$0.4521     │ +0.45%    │ 0.4523 USDC  │ -0.12%     │ 0.25%  ║
╚══════════════╧══════════════╧══════════════╧═══════════╧══════════════╧════════════╧════════╝
```

*   **Buy Pool:** The address of the pool where the price is **lower**. You "buy" base token here.
*   **Sell Pool:** The address of the pool where the price is **higher**. You "sell" base token here.
*   **Net Profit:** The actual profit in USDC **after** subtracting estimated Solana network fees.
*   **Profit %:** Your return on investment for this specific trade size.
*   **Slippage:** The expected price impact. If it's too high (red), the trade might be risky.

## 5. Next Steps

*   **Reduce Latency:** Use a private RPC node located close to Solana's mainnet validators.
*   **Adjust Trade Size:** Larger trades might increase absolute profit but also increase price impact (slippage).
*   **Explore New Pairs:** Try monitoring trending tokens with high volatility.
