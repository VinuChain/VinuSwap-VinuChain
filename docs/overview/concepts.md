# Core Concepts

This page covers the fundamental concepts behind VinuSwap's concentrated liquidity protocol.

## Concentrated Liquidity

Unlike traditional AMMs that spread liquidity uniformly across all prices (0 to ∞), VinuSwap allows liquidity providers to **concentrate** their capital within custom price ranges.

### How It Works

```
Traditional AMM (x * y = k):
Liquidity spread across entire price range
┌────────────────────────────────────────┐
│████████████████████████████████████████│
└────────────────────────────────────────┘
  $0                                    $∞

VinuSwap Concentrated Liquidity:
Liquidity concentrated in active range
┌────────────────────────────────────────┐
│          ████████████████              │
└────────────────────────────────────────┘
  $0      $1,800    $2,200              $∞
           ▲ Active Range ▲
```

### Benefits

1. **Capital Efficiency**: Up to 4000x more capital efficient than traditional AMMs
2. **Higher Fee Earnings**: Concentrated capital earns more fees within the active range
3. **Customizable Exposure**: LPs choose their price exposure

### Trade-offs

- Liquidity only earns fees when price is within the selected range
- Positions require more active management
- Impermanent loss can be higher if price moves outside the range

## Ticks and Tick Spacing

VinuSwap discretizes the price space into **ticks**. Each tick represents a 0.01% (1 basis point) price change.

### Tick Math

```
price(tick) = 1.0001^tick
```

For example:
- Tick 0 = price 1.0
- Tick 100 = price 1.0001^100 ≈ 1.01
- Tick -100 = price 1.0001^-100 ≈ 0.99

### Tick Spacing

**Tick spacing** determines which ticks can be initialized with liquidity. A tick spacing of 10 means only ticks divisible by 10 can be used as range boundaries.

| Tick Spacing | Use Case |
|--------------|----------|
| 1 | Stable pairs (0.01% increments) |
| 10 | Standard pairs (0.1% increments) |
| 60 | Volatile pairs (0.6% increments) |

## Positions

A **position** represents a liquidity provider's capital within a specific price range.

### Position Parameters

| Parameter | Description |
|-----------|-------------|
| `owner` | Address that owns the position |
| `tickLower` | Lower bound of the price range |
| `tickUpper` | Upper bound of the price range |
| `liquidity` | Amount of liquidity in the position |

### Position States

```
Price Below Range     Price In Range       Price Above Range
    ┌───────┐            ┌───────┐            ┌───────┐
    │100% B │            │ A │ B │            │100% A │
    └───────┘            └───────┘            └───────┘

Position holds only    Position holds       Position holds only
Token B (quote)        both tokens          Token A (base)
```

## Fees

### Swap Fees

Fees are collected on every swap and distributed proportionally to in-range liquidity providers.

```
Fee Tiers (examples):
- 0.01% (1 bps)   - Stable pairs
- 0.05% (5 bps)   - Standard pairs
- 0.25% (25 bps)  - Moderate volatility
- 1.00% (100 bps) - High volatility
```

### Protocol Fees

A portion of swap fees can be directed to the protocol through the `feeProtocol` parameter:

```
Protocol Fee = Swap Fee × (1/feeProtocol)

Example: feeProtocol = 5
Protocol receives 20% of swap fees (1/5)
LPs receive 80% of swap fees (4/5)
```

## Price Representation

VinuSwap stores prices in **Q64.96 fixed-point format** as `sqrtPriceX96`:

```
sqrtPriceX96 = √price × 2^96
```

### Conversion Examples

```javascript
// Price to sqrtPriceX96
sqrtPriceX96 = Math.sqrt(price) * (2 ** 96)

// sqrtPriceX96 to price
price = (sqrtPriceX96 / (2 ** 96)) ** 2
```

## Oracle

Each pool maintains a **time-weighted average price (TWAP) oracle** through observations.

### Observations

```solidity
struct Observation {
    uint32 blockTimestamp;           // When observation was recorded
    int56 tickCumulative;            // Cumulative tick value
    uint160 secondsPerLiquidityCumulativeX128;  // Liquidity seconds
    bool initialized;                // Whether observation is valid
}
```

### Using the Oracle

```javascript
// Get TWAP over last hour
const secondsAgo = 3600;
const [tickCumulatives] = await pool.observe([secondsAgo, 0]);
const averageTick = (tickCumulatives[1] - tickCumulatives[0]) / secondsAgo;
const twapPrice = 1.0001 ** averageTick;
```

## Liquidity Math

### Adding Liquidity

When adding liquidity to a range, the required token amounts depend on the current price relative to the range:

```
Current price below range:  Only token1 required
Current price in range:     Both tokens required (ratio depends on price)
Current price above range:  Only token0 required
```

### Liquidity Amount Calculation

```javascript
// For in-range positions
liquidity = min(
    amount0 × √(pUpper × pLower) / (√pUpper - √pLower),
    amount1 / (√pCurrent - √pLower)
)
```

## Callbacks

VinuSwap uses a **callback pattern** for efficient token transfers:

### Swap Callback Flow

```
1. User calls SwapRouter.exactInputSingle()
2. Router calls Pool.swap()
3. Pool executes swap logic
4. Pool calls Router.uniswapV3SwapCallback()
5. Router transfers tokens to pool
6. Pool verifies receipt and completes
```

### Mint Callback Flow

```
1. User calls PositionManager.mint()
2. Manager calls Pool.mint()
3. Pool calculates required amounts
4. Pool calls Manager.uniswapV3MintCallback()
5. Manager transfers tokens to pool
6. Pool verifies and updates position
```

## VinuSwap Extensions

### Fee Manager

VinuSwap adds a **fee manager** system allowing dynamic fee computation:

```solidity
interface IFeeManager {
    function computeFee(uint24 fee) external returns (uint24);
}
```

This enables:
- Tiered discounts based on token holdings
- Per-pool fee overrides
- Custom fee logic

### Position Locking

The NonfungiblePositionManager includes **position locking**:

```solidity
struct Position {
    // ... standard fields ...
    uint256 lockedUntil;  // Timestamp until position is locked
}
```

Locked positions cannot:
- Decrease liquidity
- Be burned

But can still:
- Collect accumulated fees
- Increase liquidity

## Next Steps

- [Architecture](architecture.md) - Understand the contract structure
- [Executing Swaps](../guides/swapping.md) - Learn to implement swaps
- [Providing Liquidity](../guides/providing-liquidity.md) - Start earning fees
