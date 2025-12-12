# Architecture

VinuSwap follows a layered architecture separating core AMM logic from user-facing periphery contracts.

## Contract Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            USER LAYER                                   │
│                     (External Applications/Users)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PERIPHERY LAYER                                 │
│  ┌─────────────────┐  ┌───────────────────────┐  ┌─────────────────┐   │
│  │   SwapRouter    │  │ NonfungiblePosition   │  │ VinuSwapQuoter  │   │
│  │                 │  │      Manager          │  │                 │   │
│  │ - exactInput    │  │ - mint/burn           │  │ - quoteExact    │   │
│  │ - exactOutput   │  │ - increase/decrease   │  │ - estimate gas  │   │
│  │ - multi-hop     │  │ - collect/lock        │  │                 │   │
│  └─────────────────┘  └───────────────────────┘  └─────────────────┘   │
│                                                                         │
│  ┌─────────────────┐  ┌───────────────────────┐                        │
│  │  Controller     │  │ PositionDescriptor    │                        │
│  │ - createPool    │  │ - tokenURI            │                        │
│  │ - collectFees   │  │ - SVG generation      │                        │
│  │ - distribute    │  │                       │                        │
│  └─────────────────┘  └───────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CORE LAYER                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      VinuSwapFactory                               │ │
│  │  - createPool(tokenA, tokenB, fee, tickSpacing, feeManager)       │ │
│  │  - getPool(tokenA, tokenB, fee)                                   │ │
│  │  - Ownership control                                               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │ creates                                  │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       VinuSwapPool                                 │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │ │
│  │  │   Slot0     │  │  Positions   │  │      Observations        │  │ │
│  │  │ sqrtPrice   │  │  liquidity   │  │    TWAP Oracle Data      │  │ │
│  │  │ tick        │  │  feeGrowth   │  │                          │  │ │
│  │  │ feeProtocol │  │              │  │                          │  │ │
│  │  └─────────────┘  └──────────────┘  └──────────────────────────┘  │ │
│  │                                                                    │ │
│  │  Functions: initialize, mint, burn, swap, collect, observe         │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FEE MANAGEMENT LAYER                               │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ TieredDiscount  │  │OverridableFeeManager│  │    NoDiscount       │ │
│  │ Balance-based   │  │ Per-pool overrides  │  │ Passthrough         │ │
│  │ fee discounts   │  │                     │  │                     │ │
│  └─────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Contracts

### VinuSwapFactory

The factory is the canonical registry for all VinuSwap pools.

**Responsibilities:**
- Deploy new pools with deterministic addresses
- Maintain pool registry (token pair + fee → pool address)
- Ownership and access control

**Key Difference from Uniswap V3:**
- Requires `feeManager` parameter for each pool
- Only factory owner can create pools

```solidity
function createPool(
    address tokenA,
    address tokenB,
    uint24 fee,
    int24 tickSpacing,
    address feeManager
) external returns (address pool);
```

### VinuSwapPool

Each pool is an independent AMM for a specific token pair and fee tier.

**Components:**

| Component | Purpose |
|-----------|---------|
| Slot0 | Current price, tick, oracle state, protocol fee |
| Positions | Mapping of owner/tick range to liquidity |
| Ticks | Liquidity changes at each initialized tick |
| Tick Bitmap | Efficient lookup of initialized ticks |
| Observations | Historical data for TWAP oracle |

**Security Features:**
- Reentrancy guard via `lock` modifier
- Delegatecall protection via `NoDelegateCall`

### VinuSwapPoolDeployer

Handles the deterministic deployment of pools using CREATE2.

```
Pool Address = CREATE2(
    factory,
    keccak256(abi.encode(token0, token1, fee)),
    poolBytecode
)
```

## Periphery Contracts

### SwapRouter

Stateless router for executing swaps. Implements slippage protection and deadline validation.

**Supported Operations:**
- `exactInputSingle` - Swap exact input amount for minimum output
- `exactInput` - Multi-hop exact input swap
- `exactOutputSingle` - Swap maximum input for exact output
- `exactOutput` - Multi-hop exact output swap

**Mixins:**
- `PeripheryPayments` - Token transfer handling
- `PeripheryValidation` - Deadline and slippage checks
- `Multicall` - Batch multiple operations
- `SelfPermit` - ERC20 permit support

### NonfungiblePositionManager

Wraps liquidity positions as ERC721 NFTs for easier management.

**Extended Features (VinuSwap):**
- Position locking with `lockedUntil` timestamp
- `lock()` function to set lock duration

**Operations:**
- `mint` - Create new position NFT
- `increaseLiquidity` - Add liquidity to position
- `decreaseLiquidity` - Remove liquidity (blocked if locked)
- `collect` - Claim accumulated fees
- `burn` - Destroy position NFT (blocked if locked)
- `lock` - Lock position until timestamp (VinuSwap extension)

### VinuSwapQuoter

Simulates swaps to estimate output amounts without executing on-chain.

**Features:**
- Estimates amount out for exact input
- Estimates amount in for exact output
- Returns price impact (sqrtPriceX96After)
- Counts initialized ticks crossed (gas estimation)

### Controller

Fee collection and distribution contract for protocol governance.

**Features:**
- Pool creation wrapper
- Protocol fee collection
- Multi-account fee distribution with configurable shares

## Fee Management

### IFeeManager Interface

```solidity
interface IFeeManager {
    function computeFee(uint24 fee) external returns (uint24);
}
```

Called during swap execution to potentially modify the fee.

### TieredDiscount

Reduces fees based on user's token balance:

```
Balance >= 1,000,000 tokens → 4% discount
Balance >= 100,000 tokens  → 3% discount
Balance >= 10,000 tokens   → 2% discount
Balance >= 1,000 tokens    → 1% discount
```

### OverridableFeeManager

Allows per-pool fee manager customization while maintaining a default.

## Data Flow

### Swap Flow

```
┌──────┐    exactInputSingle()    ┌─────────────┐
│ User │ ───────────────────────▶ │ SwapRouter  │
└──────┘                          └──────┬──────┘
                                         │ swap()
                                         ▼
                                  ┌─────────────┐
                                  │ VinuSwapPool│
                                  └──────┬──────┘
                                         │ callback
                                         ▼
                                  ┌─────────────┐
                                  │ SwapRouter  │
                                  └──────┬──────┘
                                         │ transferFrom
                                         ▼
                                  ┌─────────────┐
                                  │   ERC20     │
                                  └─────────────┘
```

### Mint Flow

```
┌──────┐      mint()        ┌─────────────────┐
│ User │ ─────────────────▶ │ NonfungiblePM   │
└──────┘                    └────────┬────────┘
                                     │ mint()
                                     ▼
                              ┌─────────────┐
                              │ VinuSwapPool│
                              └──────┬──────┘
                                     │ callback
                                     ▼
                              ┌─────────────────┐
                              │ NonfungiblePM   │
                              └────────┬────────┘
                                       │ pay()
                                       ▼
                              ┌─────────────┐
                              │   ERC20     │
                              └─────────────┘
```

### Fee Collection Flow

```
┌───────────┐  collectProtocolFees()  ┌─────────────┐
│ Controller│ ───────────────────────▶│ VinuSwapPool│
└─────┬─────┘                         └──────┬──────┘
      │                                      │
      │◀──── transfer protocol fees ─────────┘
      │
      │  distribute to shareholders
      ▼
┌───────────────────────────────────────────────────┐
│  Account 1 (share: 1)                             │
│  Account 2 (share: 2)                             │
│  Account 3 (share: 2)                             │
└───────────────────────────────────────────────────┘
```

## Library Dependencies

### Core Libraries (from Uniswap V3)

| Library | Purpose |
|---------|---------|
| TickMath | Tick ↔ sqrtPrice conversions |
| SqrtPriceMath | Price calculations |
| SwapMath | Swap step computations |
| Position | Position management |
| Tick | Tick state management |
| TickBitmap | Efficient tick lookup |
| Oracle | TWAP observation management |
| FullMath | 512-bit math operations |
| UnsafeMath | Gas-optimized math |
| LowGasSafeMath | Overflow-safe math |
| SafeCast | Safe type conversions |

### Periphery Libraries

| Library | Purpose |
|---------|---------|
| Path | Multi-hop path encoding |
| PoolAddress | Deterministic address computation |
| CallbackValidation | Callback security |
| LiquidityAmounts | Token ↔ liquidity calculations |
| OracleLibrary | TWAP helpers |
| NFTDescriptor | NFT metadata generation |
| TransferHelper | Safe token transfers |

## Security Model

### Access Control

| Contract | Owner Functions |
|----------|-----------------|
| VinuSwapFactory | createPool, setOwner |
| VinuSwapPool | setFeeProtocol, collectProtocol (factory owner) |
| Controller | createPool, setFeeProtocol, collectProtocolFees |
| TieredDiscount | setThresholds, setDiscounts |

### Protection Mechanisms

1. **Reentrancy Guard** - `lock` modifier on all pool state changes
2. **Delegatecall Prevention** - `noDelegateCall` modifier on core functions
3. **Callback Validation** - Verifies callbacks originate from legitimate pools
4. **Deadline Checks** - Prevents stale transactions
5. **Slippage Protection** - User-defined minimum/maximum amounts

## Next Steps

- [Core Concepts](concepts.md) - Understand the mechanics
- [VinuSwapFactory Reference](../reference/core/factory.md) - Factory API
- [VinuSwapPool Reference](../reference/core/pool.md) - Pool API
