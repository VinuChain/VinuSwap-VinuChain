# Utilities

Helper functions for price calculations and conversions.

## Price Encoding

### encodePrice

Converts a decimal price to sqrtPriceX96 format.

```typescript
function encodePrice(price: number): BigNumber
```

**Parameters:**
- `price` - Decimal price (token1/token0)

**Returns:**
- `BigNumber` - sqrtPriceX96 format

**Example:**

```typescript
import { encodePrice } from './sdk/utils';

// 1 ETH = 2000 USDC
const sqrtPriceX96 = encodePrice(2000);
```

### decodePrice

Converts sqrtPriceX96 to decimal price.

```typescript
function decodePrice(sqrtPriceX96: BigNumber): number
```

**Parameters:**
- `sqrtPriceX96` - Price in Q64.96 format

**Returns:**
- `number` - Decimal price

**Example:**

```typescript
const price = decodePrice(sqrtPriceX96);
console.log('Price:', price); // 2000
```

## Tick Utilities

### priceToTick

Converts a price to the nearest tick.

```typescript
function priceToTick(price: number): number
```

**Formula:** `tick = floor(log(price) / log(1.0001))`

**Example:**

```typescript
const tick = priceToTick(2000);
// tick ≈ 75862
```

### tickToPrice

Converts a tick to its corresponding price.

```typescript
function tickToPrice(tick: number): number
```

**Formula:** `price = 1.0001^tick`

**Example:**

```typescript
const price = tickToPrice(75862);
// price ≈ 2000
```

### nearestUsableTick

Rounds a tick to the nearest valid tick based on tick spacing.

```typescript
function nearestUsableTick(tick: number, tickSpacing: number): number
```

**Example:**

```typescript
// For 0.3% fee pools (tickSpacing = 60)
const usableTick = nearestUsableTick(75862, 60);
// usableTick = 75840
```

## Path Encoding

### encodePath

Encodes a multi-hop swap path.

```typescript
function encodePath(tokens: string[], fees: number[]): string
```

**Parameters:**
- `tokens` - Array of token addresses
- `fees` - Array of fee tiers between each hop

**Returns:**
- `string` - Encoded path as hex string

**Example:**

```typescript
// WETH → USDC → DAI
const path = encodePath(
    [WETH, USDC, DAI],
    [3000, 500]  // WETH/USDC 0.3%, USDC/DAI 0.05%
);
```

### decodePath

Decodes an encoded path back to tokens and fees.

```typescript
function decodePath(path: string): { tokens: string[], fees: number[] }
```

## Liquidity Math

### getLiquidityForAmounts

Calculates liquidity from token amounts.

```typescript
function getLiquidityForAmounts(
    sqrtPriceX96: BigNumber,
    sqrtRatioAX96: BigNumber,
    sqrtRatioBX96: BigNumber,
    amount0: BigNumber,
    amount1: BigNumber
): BigNumber
```

### getAmountsForLiquidity

Calculates token amounts from liquidity.

```typescript
function getAmountsForLiquidity(
    sqrtPriceX96: BigNumber,
    sqrtRatioAX96: BigNumber,
    sqrtRatioBX96: BigNumber,
    liquidity: BigNumber
): { amount0: BigNumber, amount1: BigNumber }
```

## Custom Tick Spacing

### withCustomTickSpacing

Creates utilities for custom tick spacing.

```typescript
function withCustomTickSpacing(tickSpacing: number): {
    nearestTick: (tick: number) => number;
    validTicks: (lower: number, upper: number) => { tickLower: number, tickUpper: number };
}
```

**Example:**

```typescript
const utils = withCustomTickSpacing(60);

// Get nearest valid tick
const tick = utils.nearestTick(75862);

// Get valid range
const range = utils.validTicks(-100, 100);
```

## Constants

```typescript
// Tick bounds
const MIN_TICK = -887272;
const MAX_TICK = 887272;

// Price bounds (Q64.96)
const MIN_SQRT_RATIO = BigNumber.from('4295128739');
const MAX_SQRT_RATIO = BigNumber.from('1461446703485210103287273052203988822378723970342');

// Q96 multiplier
const Q96 = BigNumber.from(2).pow(96);
```

## BigNumber Helpers

### formatSqrtPriceX96

Formats sqrtPriceX96 for display.

```typescript
function formatSqrtPriceX96(sqrtPriceX96: BigNumber, decimals0: number, decimals1: number): string
```

**Example:**

```typescript
const formattedPrice = formatSqrtPriceX96(sqrtPriceX96, 18, 6);
// "2000.00 USDC/ETH"
```

## Usage Examples

### Price Range Calculation

```typescript
import { priceToTick, nearestUsableTick, tickToPrice } from './sdk/utils';

function createPriceRange(
    currentPrice: number,
    lowerPrice: number,
    upperPrice: number,
    tickSpacing: number
) {
    const currentTick = priceToTick(currentPrice);
    const tickLower = nearestUsableTick(priceToTick(lowerPrice), tickSpacing);
    const tickUpper = nearestUsableTick(priceToTick(upperPrice), tickSpacing);

    return {
        currentTick,
        tickLower,
        tickUpper,
        actualLowerPrice: tickToPrice(tickLower),
        actualUpperPrice: tickToPrice(tickUpper)
    };
}

// Example: Create range around current price
const range = createPriceRange(2000, 1800, 2200, 60);
```

### Multi-Hop Path Building

```typescript
function buildOptimalPath(
    tokenIn: string,
    tokenOut: string,
    intermediates: string[],
    preferredFees: number[] = [500, 3000, 10000]
): string[] {
    // Try direct paths first
    const directPaths = preferredFees.map(fee =>
        encodePath([tokenIn, tokenOut], [fee])
    );

    // Then try intermediate paths
    const intermediatePaths = intermediates.flatMap(intermediate =>
        preferredFees.flatMap(fee1 =>
            preferredFees.map(fee2 =>
                encodePath([tokenIn, intermediate, tokenOut], [fee1, fee2])
            )
        )
    );

    return [...directPaths, ...intermediatePaths];
}
```

### Slippage Calculation

```typescript
function calculateSlippage(
    expectedAmount: BigNumber,
    slippagePercent: number
): BigNumber {
    const slippageBps = Math.floor(slippagePercent * 100);
    return expectedAmount.mul(10000 - slippageBps).div(10000);
}

// For exact input: minimum output
const minOutput = calculateSlippage(expectedOutput, 0.5);

// For exact output: maximum input
function calculateMaxInput(
    expectedInput: BigNumber,
    slippagePercent: number
): BigNumber {
    const slippageBps = Math.floor(slippagePercent * 100);
    return expectedInput.mul(10000 + slippageBps).div(10000);
}
```
