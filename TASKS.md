src/
├── index.ts
│
├── config/
│   ├── index.ts
│   └── schema.ts
│
├── core/                        # ЧИСТА БІЗНЕС-ЛОГІКА (не знає про Solana/RPC)
│   ├── orchestrator.ts          # головний цикл
│   ├── pricing.ts               # розрахунок цін (чиста математика)
│   ├── arbitrage.ts             # net profit, фільтри, сортування
│   └── types.ts                 # Pool, Opportunity, etc.
│
├── solana/                      # ІНТЕГРАЦІЯ З SOLANA (RPC + Raydium)
│   ├── client.ts                # RPC wrapper
│   ├── poolDiscovery.ts         # пошук пулів через RPC (перенесено!)
│   ├── raydium.ts               # Raydium constants, program IDs, fee rates
│   ├── parsers.ts               # decode pool accounts
│   └── constants.ts             # Solana constants
│
├── services/                    # GLUE LAYER
│   └── poolService.ts           # об'єднує solana + core
│
├── ui/
│   ├── renderer.ts
│   └── formatters.ts
│
├── logger/
│   └── logger.ts
│
└── utils/
    ├── math.ts
    └── time.ts