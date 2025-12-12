# SDK Overview

The VinuSwap SDK provides a TypeScript interface for interacting with VinuSwap contracts.

## Features

- **Pool Interaction** - Query pool state and execute swaps
- **Position Management** - Create, modify, and close liquidity positions
- **Quote Generation** - Get expected swap amounts
- **Price Utilities** - Convert between prices and ticks

## Location

The SDK is located in the `sdk/` directory:

```
sdk/
├── core.ts        # Main VinuSwap class
├── utils.ts       # Price and math utilities
└── abi/
    └── ERC20.json # Token ABI
```

## Quick Start

```typescript
import { VinuSwap } from './sdk/core';
import { encodePrice } from './sdk/utils';

// Create SDK instance
const vinuSwap = await VinuSwap.create(
    tokenA,             // Token A address
    tokenB,             // Token B address
    poolAddress,        // Pool contract address
    quoterAddress,      // Quoter contract address
    routerAddress,      // Router contract address
    positionManagerAddress,  // Position manager address
    provider            // ethers provider
);

// Connect signer for transactions
const connected = vinuSwap.connect(signer);

// Execute swap
const result = await connected.swap(
    amountIn,
    minAmountOut,
    deadline
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       VinuSwap SDK                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │  VinuSwap   │  │   Utilities  │  │   Price Math    │    │
│  │    Class    │  │              │  │                 │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     ethers.js                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    VinuSwap Contracts                       │
│  Pool │ Router │ Position Manager │ Quoter                  │
└─────────────────────────────────────────────────────────────┘
```

## Key Classes

### VinuSwap

Main class for interacting with VinuSwap:

```typescript
class VinuSwap {
    // Contract references
    pool: VinuSwapPool;
    quoter: VinuSwapQuoter;
    router: SwapRouter;
    positionManager: NonfungiblePositionManager;

    // Token contracts
    token0Contract: ethers.Contract;
    token1Contract: ethers.Contract;

    // Factory method
    static async create(...): Promise<VinuSwap>;

    // Connection
    connect(signer: Signer): VinuSwap;

    // Operations
    async swap(...): Promise<SwapResult>;
    async mint(...): Promise<MintResult>;
    async getQuote(...): Promise<Quote>;
}
```

## Dependencies

- **ethers.js** - Ethereum interaction
- **@uniswap/v3-sdk** - Price calculations and math
- **@uniswap/sdk-core** - Token and pool utilities

## Type Safety

The SDK is written in TypeScript with full type definitions:

```typescript
interface SwapParams {
    amountIn: BigNumber;
    amountOutMinimum: BigNumber;
    deadline: number;
    sqrtPriceLimitX96?: BigNumber;
}

interface SwapResult {
    amountIn: BigNumber;
    amountOut: BigNumber;
    transactionHash: string;
}
```

## Next Steps

- [Installation](installation.md)
- [VinuSwap Class](vinuswap-class.md)
- [Utilities](utilities.md)
- [Examples](examples.md)
