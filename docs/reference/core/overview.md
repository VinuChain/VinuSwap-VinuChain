# Core Contracts Overview

The core contracts provide the fundamental AMM functionality and safety guarantees for VinuSwap.

## Contract Summary

| Contract | Purpose | Source |
|----------|---------|--------|
| [VinuSwapFactory](factory.md) | Pool deployment and registry | `contracts/core/VinuSwapFactory.sol` |
| [VinuSwapPool](pool.md) | Concentrated liquidity AMM | `contracts/core/VinuSwapPool.sol` |
| [VinuSwapPoolDeployer](deployer.md) | Deterministic pool deployment | `contracts/core/VinuSwapPoolDeployer.sol` |
| NoDelegateCall | Security mixin | `contracts/core/NoDelegateCall.sol` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VinuSwapFactory                             │
│  - createPool()                                                 │
│  - getPool()                                                    │
│  - owner management                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ creates via VinuSwapPoolDeployer
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VinuSwapPool                               │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │      Slot0       │  │    Positions     │                    │
│  │  sqrtPriceX96    │  │  owner→liquidity │                    │
│  │  tick            │  │  feeGrowthInside │                    │
│  │  observationIdx  │  │                  │                    │
│  │  feeProtocol     │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │     Ticks        │  │   Observations   │                    │
│  │  liquidityDelta  │  │  tickCumulative  │                    │
│  │  feeGrowthOut    │  │  secondsPerLiq   │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  Core Functions:                                                │
│  - initialize()  - swap()   - mint()   - burn()                │
│  - collect()     - observe()                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Differences from Uniswap V3

### 1. Fee Manager Integration

Every pool is created with a `feeManager` address that can dynamically modify swap fees:

```solidity
// VinuSwapFactory.createPool()
function createPool(
    address tokenA,
    address tokenB,
    uint24 fee,
    int24 tickSpacing,
    address feeManager  // VinuSwap addition
) external returns (address pool);
```

The fee manager is called during swaps:

```solidity
// Inside VinuSwapPool.swap()
uint24 effectiveFee = IFeeManager(feeManager).computeFee(fee);
```

### 2. Owner-Only Pool Creation

Unlike Uniswap V3's permissionless pool creation, VinuSwap restricts pool creation to the factory owner:

```solidity
function createPool(...) external returns (address pool) {
    require(msg.sender == owner);  // VinuSwap restriction
    // ... pool creation logic
}
```

### 3. Flexible Tick Spacing

VinuSwap allows custom tick spacing per pool (within bounds) rather than fixed fee-tier mappings:

```solidity
require(tickSpacing > 0 && tickSpacing < 16384);
```

## Immutable Pool Parameters

Each pool stores these values immutably at deployment:

| Parameter | Description |
|-----------|-------------|
| `factory` | Address of VinuSwapFactory |
| `token0` | First token (lower address) |
| `token1` | Second token (higher address) |
| `fee` | Swap fee in hundredths of a bip (e.g., 3000 = 0.3%) |
| `tickSpacing` | Minimum tick distance for positions |
| `maxLiquidityPerTick` | Maximum liquidity at any tick |
| `feeManager` | Address of fee computation contract |

## Pool State Variables

### Slot0

The primary state slot containing current pool status:

```solidity
struct Slot0 {
    uint160 sqrtPriceX96;         // Current √price in Q64.96
    int24 tick;                   // Current tick
    uint16 observationIndex;      // Oracle array index
    uint16 observationCardinality;     // Oracle array size
    uint16 observationCardinalityNext; // Next oracle size
    uint8 feeProtocol;            // Protocol fee (packed)
    bool unlocked;                // Reentrancy lock
}
```

### Global Fee Accumulators

```solidity
uint256 feeGrowthGlobal0X128;  // Token0 fees per unit liquidity
uint256 feeGrowthGlobal1X128;  // Token1 fees per unit liquidity
```

### Protocol Fees

```solidity
uint128 protocolFees.token0;   // Uncollected protocol fees
uint128 protocolFees.token1;
```

### Liquidity

```solidity
uint128 liquidity;  // Current in-range liquidity
```

## Security Features

### Reentrancy Protection

All state-changing functions are protected:

```solidity
modifier lock() {
    require(slot0.unlocked, 'LOK');
    slot0.unlocked = false;
    _;
    slot0.unlocked = true;
}
```

### Delegatecall Prevention

Core contracts cannot be used as implementation targets:

```solidity
modifier noDelegateCall() {
    require(address(this) == original);
    _;
}
```

## Events

### Pool Events

| Event | Emitted When |
|-------|--------------|
| `Initialize` | Pool price is set for the first time |
| `Mint` | Liquidity is added to a position |
| `Burn` | Liquidity is removed from a position |
| `Swap` | A swap is executed |
| `Collect` | Fees are collected from a position |
| `CollectProtocol` | Protocol fees are withdrawn |
| `SetFeeProtocol` | Protocol fee setting is changed |
| `IncreaseObservationCardinalityNext` | Oracle capacity increased |

### Factory Events

| Event | Emitted When |
|-------|--------------|
| `PoolCreated` | New pool is deployed |
| `OwnerChanged` | Factory ownership transfers |

## Error Messages

| Error | Meaning |
|-------|---------|
| `LOK` | Reentrancy detected |
| `TLU` | tickLower >= tickUpper |
| `TLM` | tickLower < MIN_TICK |
| `TUM` | tickUpper > MAX_TICK |
| `AI` | Pool already initialized |
| `M0` | Mint amount cannot be 0 |
| `AS` | Amount specified cannot be 0 |
| `IIA` | Invalid input amount |
| `SPL` | sqrtPriceLimit invalid |
| `L` | Liquidity overflow |

## Next Steps

- [VinuSwapFactory](factory.md) - Factory contract reference
- [VinuSwapPool](pool.md) - Pool contract reference
- [VinuSwapPoolDeployer](deployer.md) - Deployer reference
