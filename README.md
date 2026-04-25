# Solana Raydium CPMM Arbitrage Monitor

A real-time, open-source arbitrage monitoring tool for Raydium CPMM pools on the Solana blockchain. This tool continuously scans multiple liquidity pools for a specific token pair, detects price discrepancies, and calculates the precise net profit of executing a two-hop arbitrage trade.

Built for the **Superteam Ukraine** bounty.

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

To run the application using configuration from your `.env` file:
```bash
npm run dev     # development mode
npm run start   # production mode
```

You can also override configuration or run the tool entirely via CLI arguments (using positional arguments for the token pair):
```bash
npm run start -- monitor So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --min-profit 0.001 --trade-size 1000
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

## License
MIT
