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
To run the application in development mode:
```bash
npm run dev
```
To run the compiled production version:
```bash
npm run start
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
# Technical Specification: Raydium CPMM Arbitrage Monitor
## 📂 Project Structure
```text
src/
├── index.ts                     # Entry point
│
├── config/
│   ├── index.ts                 # Config loader and env mapper
│   └── schema.ts                # Zod validation schema
│   
├── core/                        # PURE BUSINESS LOGIC (Zero Solana/RPC dependencies)
│   ├── orchestrator.ts          # Main event loop / monitor cycle
│   ├── pricing.ts               # Price math, CPMM formulas, Net Profit
│   ├── arbitrage.ts             # Profitability checks, sorting, filtering
│   └── types.ts                 # Core entities (Pool, Opportunity)
│
├── solana/                      # BLOCKCHAIN INFRASTRUCTURE
│   ├── client.ts                # Resilient RPC Wrapper (retries, rate limits)
│   ├── poolDiscovery.ts         # Pool fetching via getProgramAccounts & SDK decoding
│   ├── raydium.ts               # Program IDs, layouts
│   ├── parsers.ts               # Deserialization of on-chain data
│   └── constants.ts             # Blockchain constants
│
├── ui/                          # PRESENTATION LAYER
│   ├── renderer.ts              # CLI rendering logic (e.g., cli-table3)
│   └── formatters.ts            # Formatting for numbers, addresses, times
│
├── services/                    # GLUE LAYER
│   └── poolService.ts           # integrates solana + core
│
├── logger/
│   └── logger.ts                # Winston-based structured logging
│
└── utils/
    ├── math.ts
    └── time.ts
```
---
## 🎯 1. Core Objectives & Requirements
Build a real-time arbitrage monitoring tool that detects price discrepancies across multiple Raydium CPMM liquidity pools for a specific token pair (e.g., WSOL/USDC). 
The tool must continuously fetch on-chain data, calculate prices locally, simulate two-hop trades (Buy Token A in Pool X -> Sell Token A in Pool Y), subtract transaction costs, and surface the most profitable opportunities in a live CLI table.
---

## 🏗 2. Implementation Tasks

### Phase 1: Infrastructure & Configuration
- [ ] **Config Module (`src/config`):** 
  - Use `zod` to validate all inputs. 
  - Required fields: `RPC_URL`, `MINT_A`, `MINT_B`, `QUOTE_MINT`, `POLLING_INTERVAL_MS`, `MIN_PROFIT_THRESHOLD`, `TRADE_SIZE`, `MAX_SLIPPAGE_PERCENT`, `TX_COST_IN_QUOTE`.
  - Support loading from `.env`.
- [ ] **RPC Wrapper (`src/solana/client.ts`):** 
  - Implement a resilient RPC client wrapping `@solana/web3.js`.
  - Add exponential backoff for retries.
  - Implement chunking for `getMultipleAccounts` (max 100 per request) to bypass RPC limits.
- [ ] **Logger (`src/logger/logger.ts`):** 
  - Implement structured logging (e.g., via `winston`).
  - Differentiate between info, debug, warn, and error levels.
### Phase 2: Solana Data Fetching (Discovery)
- [ ] **Pool Discovery (`src/solana/poolDiscovery.ts`):**
  - Use `getProgramAccounts` on the Raydium CPMM Program ID.
  - Optimize fetching using `dataSize` and `memcmp` filters (matching Token 0 and Token 1 mints).
  - Decode raw account data into Pool State using `@raydium-io/raydium-sdk-v2`.
  - Filter out pools where swaps are disabled.
- [ ] **State Refreshing:**
  - Create a batch fetching mechanism using `getMultipleAccounts` to periodically pull vault balances (reserves) and `ammConfig` (for fee rates) for all discovered pools.

### Phase 3: Core Math & Business Logic
- [ ] **Pricing Math (`src/core/pricing.ts`):**
  - Implement CPMM math: $X \times Y = K$.
  - Implement exact output calculation: `amountOut = (amountIn * (1 - fee) * reserveOut) / (reserveIn + amountIn * (1 - fee))`.
  - Validate math using bigints internally to prevent precision loss, converting to `number` only for calculations.
- [ ] **Arbitrage Logic (`src/core/arbitrage.ts`):**
  - Group discovered pools by token pair.
  - Generate all possible `(BuyPool, SellPool)` combinations.
  - Simulate trade: `Token A -> Token B` (Hop 1) and `Token B -> Token A` (Hop 2).
  - Calculate `Gross Profit = FinalOut - InitialIn`.
  - Calculate `Net Profit = Gross Profit - txCostInQuote`.
  - Check slippage: `(actualOut - expectedOut) / expectedOut`.
  - Filter combinations where `Net Profit > minProfitThreshold` and `Slippage < maxSlippage`.
  - Sort results descending by Net Profit.
### Phase 4: Orchestration & UI
- [ ] **Orchestrator (`src/core/orchestrator.ts`):**
  - Tie everything together.
  - Run initial discovery.
  - Start an interval loop (`setInterval`) that fetches reserves and runs the arbitrage logic.
  - Handle RPC errors gracefully without crashing the app.
- [ ] **CLI Renderer (`src/ui/renderer.ts`):**
  - Use `cli-table3` to build a dynamic, auto-refreshing terminal UI.
  - Display: Buy Pool, Sell Pool, Net Profit, Profit %, Gross Profit, Slippage, and Pool Fees.
  - Color-code output using `chalk` (e.g., Green for profit, Red for high slippage).

---

## 📐 3. Architectural Rules & Constraints

1. **Clean Architecture:** `core/` MUST NOT import anything from `solana/`, `web3.js`, or `raydium-sdk`. Core functions take raw data interfaces and return computed results.
2. **Immutability & Purity:** Pricing and Arbitrage functions must be pure functions with no side effects (no logging, no network calls).
3. **Network Efficiency:** Never fetch the same account twice in one cycle. Group public keys and use `getMultipleAccounts` exclusively for state updates.
4. **Error Handling:** Network errors must not crash the continuous polling loop. The orchestrator must catch them, log a warning, and retry on the next tick.
Interface & UX (10%): Is the CLI or UI intuitive and does it present results in a readable, actionable format?

