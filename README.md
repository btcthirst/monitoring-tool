# Solana Raydium CPMM Arbitrage Monitor

A real-time, open-source arbitrage monitoring tool for Raydium CPMM pools on the Solana blockchain. This tool continuously scans multiple liquidity pools for a specific token pair, detects price discrepancies, and calculates the precise net profit of executing a two-hop arbitrage trade.

## 🇺🇦 Superteam Ukraine Bounty

This project was developed as a submission for the [Superteam Ukraine Raydium CPMM Arbitrage Monitor](https://superteam.fun/earn/listing/create-an-open-source-real-time-arbitrage-monitoring-tool-for-raydium-cpmm/) bounty. 

[Superteam Ukraine](https://ua.superteam.fun/) is a community of builders, designers, and marketers working in the Solana ecosystem within Ukraine. They provide opportunities for developers to contribute to the ecosystem through bounties, grants, and fellowship programs.

## 🏗 Architecture Overview

The tool is built with a strong emphasis on clean architecture and separation of concerns:

- **`core/`**: Contains pure business logic, mathematics, and pricing formulas. It has zero dependencies on Solana RPC, SDKs, or UI. This makes the logic easily testable and predictable.
- **`solana/`**: The infrastructure layer responsible for blockchain interactions. It uses `@solana/web3.js` and `@raydium-io/raydium-sdk-v2`. Features smart pool discovery using `getProgramAccounts` with `memcmp` filters, and optimized batch data fetching (`getMultipleAccounts`) to keep network overhead minimal.
- **`ui/`**: A CLI renderer using `cli-table3` to display a live-updating, color-coded table of the most profitable opportunities.
- **`config/`**: Configuration management validated strictly via `zod`.

### How it works:
1. **Discovery:** Finds all active Raydium CPMM pools matching the provided token pair.
2. **Polling:** Continuously fetches updated vault balances (reserves) for all discovered pools.
3. **Simulation:** Simulates buying in every pool and selling in every other pool (`N * (N - 1)` combinations).
4. **Ranking:** Filters out unprofitable trades, sorts by highest net profit, and renders the result.

## 🚀 Installation and Setup

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd monitoring-tool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file in the root directory (you can copy from `.env.example` if it exists):
   ```bash
   cp .env.example .env
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## ⚙️ Configuration Reference

The application is configured primarily through the `.env` file. Below are all supported configuration options:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RPC_URL` | string | `https://api.mainnet-beta.solana.com` | Your Solana RPC endpoint. A private RPC (Helius, QuickNode) is highly recommended for real-time monitoring. |
| `MINT_A` | string | `So111111...` (WSOL) | Base58 address of the first token in the pair. |
| `MINT_B` | string | `EPjFWdd5...` (USDC) | Base58 address of the second token in the pair. |
| `QUOTE_MINT` | string | `EPjFWdd5...` (USDC) | The token used to measure profit and trade size. |
| `POLLING_INTERVAL_MS`| number | `2000` | How often to refresh pool reserves (in milliseconds). |
| `MIN_PROFIT_THRESHOLD`| number | `0.01` | Minimum net profit required to display an opportunity. |
| `TRADE_SIZE` | number | `100` | The amount of `QUOTE_MINT` to use for simulating the arbitrage trade. |
| `MAX_SLIPPAGE_PERCENT`| number | `0.05` | Maximum allowed slippage (e.g., 0.05 = 5%). |
| `TX_COST_IN_QUOTE` | number | `0.0002` | Estimated transaction network fee measured in `QUOTE_MINT`. |
| `LOG_LEVEL` | string | `info` | Logging verbosity (`error`, `warn`, `info`, `debug`). |
| `MAX_OPPORTUNITIES_DISPLAY` | number| `15` | Maximum number of rows to display in the CLI table. |

## 💻 Usage

The tool can be configured via `.env` or direct CLI arguments. For a detailed step-by-step guide, see [**USAGE.md**](./USAGE.md).

### Quick Start (CLI mode)
```bash
# General syntax:
npm run start -- monitor [MINT_A] [MINT_B] [OPTIONS]

# Example: SOL/USDC arbitrage with $1000 trade size
npm run start -- monitor \
  So11111111111111111111111111111111111111112 \
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --trade-size 1000 \
  --min-profit 0.1
```

### Background Mode (Env mode)
```bash
# 1. Edit .env with your MINT_A, MINT_B and RPC_URL
# 2. Run:
npm run start -- monitor
```

### Sample Output

```text
🔍 Solana Arbitrage Monitor — Raydium CPMM
─────────────────────────────────────────────────────────────────
Trade size: 100 USDC   Min profit: 0.010000   Interval: 2.0s
─────────────────────────────────────────────────────────────────
╔══════════════╤══════════════╤══════════════╤═══════════╤══════════════╤════════════╤════════╗
║ Buy Pool     │ Sell Pool    │ Net Profit   │ Profit %  │ Gross        │ Slippage   │ Fee    ║
╟──────────────┼──────────────┼──────────────┼───────────┼──────────────┼────────────┼────────╢
║ 8sLb...4k9m  │ 2Poy...7n2x  │ +$0.4521     │ +0.45%    │ 0.4523 USDC  │ -0.12%     │ 0.25%  ║
║ 4tHj...9b1c  │ 2Poy...7n2x  │ +$0.1205     │ +0.12%    │ 0.1207 USDC  │ -0.05%     │ 0.25%  ║
╚══════════════╧══════════════╧══════════════╧═══════════╧══════════════╧════════════╧════════╝

📊 Best Opportunity:
─────────────────────────────────────────────────────────────────
  Buy  8sLb...4k9m  fee: 0.25%
  Sell 2Poy...7n2x  fee: 0.25%
─────────────────────────────────────────────────────────────────
  Amount in:  100 USDC      Amount out: 100.4523 USDC
  Gross:      0.4523 USDC   Tx cost:    0.0002 USDC
  Net profit: 0.4521 USDC   Profit %:   +0.4521%
  Slip buy:   -0.08%        Slip sell:  -0.16%
─────────────────────────────────────────────────────────────────
  Updated: 14:32:45   Last cycle: 2s ago   Renders: 124
```

## 🧮 Math & Pricing Logic

The tool strictly implements the Constant Product Market Maker (CPMM) formula: `X * Y = K`. 

### Price Calculation
The spot price (without price impact) is calculated simply by dividing the reserves:
```
Spot Price = ReserveB / ReserveA
```

### Trade Execution Calculation
When simulating a trade, the exact output amount is calculated taking the pool fee into account.
The formula used to calculate `amountOut` given an `amountIn`:
```
amountInWithFee = amountIn * (1 - fee)
amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee)
```
*This calculation is performed twice for every arbitrage check (Buy Token A with USDC -> Sell Token A for USDC).*

### Profit Calculation
1. **Gross Profit**: The difference between the final output amount and the initial trade size.
   ```
   Gross Profit = FinalAmountOut - InitialTradeSize
   ```
2. **Net Profit**: The gross profit minus the estimated transaction cost on the Solana network.
   ```
   Net Profit = Gross Profit - TransactionCost
   ```
3. **Slippage**: The relative difference between the expected output (based on spot price) and the actual output (affected by pool liquidity).
   ```
   ExpectedOut = AmountIn * SpotPrice
   Slippage = (ActualAmountOut - ExpectedOut) / ExpectedOut
   ```
   *Negative slippage indicates you are receiving less than the spot price, which is normal behavior in CPMMs.*

4. **Estimated TVL**: Calculated as twice the reserve of the quote token.
   ```
   Estimated TVL = ReserveQuote * 2
   ```
   *This is an approximation based on the CPMM property where both sides of a pool are balanced in value. It provides a reliable liquidity context without requiring external price oracles.*

> [!IMPORTANT]
> **Low Liquidity Warning**: Pools with very low TVL (< $1,000) may show unrealistically high profit percentages due to extreme price impact for even small trades. Always verify pool liquidity before acting on a signal.

## 🛠 How to Extend

This project is designed with a modular architecture, making it easy to add new features.

### 1. Adding a New DEX (e.g., Meteora or Orca)
1.  Create a new discovery script in `src/solana/` (e.g., `orcaDiscovery.ts`).
2.  Implement the `RawPool` interface in your new module.
3.  Update the `PoolService` in `src/services/poolService.ts` to include the new discovery logic.
4.  Since `core/` logic is DEX-agnostic, the arbitrage math will work automatically.

### 2. Custom Logger Adapter
1.  Modify `src/logger/logger.ts` to add a new transport (e.g., Telegram, Discord, or a remote database).
2.  Use the `logOpportunity` function to trigger alerts when a profitable trade is found.

### 3. New Arbitrage Strategies
1.  Explore `src/core/arbitrage.ts` to implement multi-hop routes (3 or more pools) or triangular arbitrage.
2.  Add new simulation functions in `src/core/pricing.ts`.

## 🚨 Troubleshooting & Error Cases

The application is built to be resilient and handle common Solana network errors gracefully.

### 1. RPC Connection Issues / Rate Limits
**Symptom:** `RPC attempt X/3 failed` or `RPC health check failed`
**Resolution:** The application uses exponential backoff to automatically retry failed requests. If you are consistently hitting rate limits on public RPC nodes (e.g. `api.mainnet-beta.solana.com`), it is highly recommended to switch to a dedicated private RPC provider like Helius, QuickNode, or Alchemy. The orchestrator will not crash; it will skip the current polling cycle and retry on the next tick.

### 2. Invalid or Unsupported Token Mints
**Symptom:** `No CPMM pools found` or `Invalid public key input`
**Resolution:** Verify that the provided token mint addresses are valid Base58 strings and that Raydium CPMM pools actually exist for this token pair. The tool requires at least **two** active pools for the same pair to simulate an arbitrage route.

### 3. Pools Data Disappeared
**Symptom:** `All pools disappeared, re-discovering...`
**Resolution:** This can occur if the RPC node returns empty data for pool accounts during a polling cycle. The orchestrator handles this by automatically clearing its cache and attempting to rediscover the pools from scratch.

### 4. Empty Arbitrage Table
**Symptom:** The tool runs successfully but says `⏳ No profitable opportunities found`.
**Resolution:** This means there are currently no price discrepancies large enough to overcome the pool fees and transaction costs. You can test the rendering logic by temporarily lowering `--min-profit` (e.g., `--min-profit -1`) to see unprofitable routes.

## ⚠️ Disclaimer

**This tool is a Monitor, not a Trading Bot.**

* **No Execution:** This software does **not** have the capability to execute trades or send transactions to the Solana blockchain. It only simulates and monitors price discrepancies.
* **No Private Keys:** The application does not require and will never ask for your private keys or seed phrases.
* **Educational Purpose:** This tool is provided for educational and monitoring purposes only. Use it at your own risk. The authors are not responsible for any financial decisions or losses incurred based on the data provided by this tool.

## License
MIT
