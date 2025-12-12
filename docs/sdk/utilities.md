# Utilities

Helper functions for price calculations and conversions.

**Source:** `sdk/utils.ts`

## Price Encoding

### encodePrice

Converts a decimal price ratio to sqrtPriceX96 format.

```typescript
function encodePrice(ratio: string): BigNumber
```

**Parameters:**
- `ratio` - Decimal price ratio as a string (token1/token0)

**Returns:**
- `BigNumber` - sqrtPriceX96 format

**Example:**

```typescript
import { encodePrice } from './sdk/utils';

// 1 WVC = 0.5 USDT (USDT is token0, WVC is token1)
const sqrtPriceX96 = encodePrice('0.5');

// For more precision
const sqrtPriceX96Precise = encodePrice('2000.50');
```

**Note:** The ratio parameter is a string to preserve precision for very large or very small numbers.

---

### decodePrice

Converts sqrtPriceX96 to a decimal price ratio.

```typescript
function decodePrice(price: BigNumber): string
```

**Parameters:**
- `price` - Price in sqrtPriceX96 (Q64.96) format

**Returns:**
- `string` - Decimal price ratio as a string

**Example:**

```typescript
import { decodePrice } from './sdk/utils';

const price = decodePrice(sqrtPriceX96);
console.log('Price:', price); // "2000"
```

**Note:** Returns a string to preserve precision.

---

## Custom Tick Spacing

### withCustomTickSpacing

Temporarily overrides the Uniswap SDK's tick spacing for a fee tier while executing a function.

```typescript
async function withCustomTickSpacing<T>(
    fee: number,
    tickSpacing: number,
    f: (() => Promise<T>) | (() => T)
): Promise<T>
```

**Parameters:**
- `fee` - Fee tier (e.g., 500, 3000, 10000)
- `tickSpacing` - Custom tick spacing to use
- `f` - Function to execute with the custom tick spacing

**Returns:**
- `Promise<T>` - Result of the function execution

**Example:**

```typescript
import { withCustomTickSpacing } from './sdk/utils';
import { Pool, Position } from '@uniswap/v3-sdk';

// VinuSwap allows custom tick spacing, but Uniswap SDK expects specific values
// Use withCustomTickSpacing to temporarily override the SDK's expectations

const position = await withCustomTickSpacing(3000, 60, () => {
    // Inside this function, the Uniswap SDK will use tickSpacing=60 for fee=3000
    return Position.fromAmounts({
        pool: pool,
        tickLower: -60,
        tickUpper: 60,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        useFullPrecision: true
    });
});
```

**Use Case:**

VinuSwap allows custom tick spacing per pool, unlike Uniswap V3 which has fixed tick spacing per fee tier. This utility lets you use the Uniswap SDK with VinuSwap's custom configurations.

---

## FixedMathBN

A bignumber.js instance configured for high-precision decimal math.

```typescript
const FixedMathBN = bn.clone({ DECIMAL_PLACES: 40, EXPONENTIAL_AT: 999999 });
```

**Configuration:**
- `DECIMAL_PLACES: 40` - 40 decimal places of precision
- `EXPONENTIAL_AT: 999999` - Prevents scientific notation for large numbers

**Example:**

```typescript
import { FixedMathBN } from './sdk/utils';

// High precision calculations
const price = new FixedMathBN('79228162514264337593543950336');
const sqrtPrice = price.sqrt();
const ratio = sqrtPrice.dividedBy(new FixedMathBN(2).pow(96)).pow(2);

console.log(ratio.toString()); // Full precision output
```

---

## Usage Examples

### Complete Price Conversion Flow

```typescript
import { encodePrice, decodePrice } from './sdk/utils';

// Encode a price for pool initialization
const initialPrice = '0.5'; // 1 WVC = 0.5 USDT
const sqrtPriceX96 = encodePrice(initialPrice);

// Later, decode the price from the pool
const currentPrice = decodePrice(sqrtPriceX96);
console.log('Current price:', currentPrice);
```

### Working with Uniswap SDK

```typescript
import { withCustomTickSpacing, encodePrice } from './sdk/utils';
import { Pool, Position, nearestUsableTick } from '@uniswap/v3-sdk';
import { Token } from '@uniswap/sdk-core';

async function createPosition(
    token0: Token,
    token1: Token,
    fee: number,
    tickSpacing: number,
    sqrtPriceX96: BigNumber,
    tickLower: number,
    tickUpper: number,
    amount0: BigNumber,
    amount1: BigNumber
) {
    return withCustomTickSpacing(fee, tickSpacing, () => {
        // Create pool instance
        const pool = new Pool(
            token0,
            token1,
            fee,
            sqrtPriceX96.toString(),
            '0', // liquidity (not needed for position creation)
            0    // tick (computed from sqrtPriceX96)
        );

        // Snap ticks to valid values
        const tickLowerUsable = nearestUsableTick(tickLower, tickSpacing);
        const tickUpperUsable = nearestUsableTick(tickUpper, tickSpacing);

        // Create position
        return Position.fromAmounts({
            pool,
            tickLower: tickLowerUsable,
            tickUpper: tickUpperUsable,
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            useFullPrecision: true
        });
    });
}
```

### Price Calculations with FixedMathBN

```typescript
import { FixedMathBN } from './sdk/utils';
import { BigNumber } from '@ethersproject/bignumber';

// Convert sqrtPriceX96 to human-readable price manually
function sqrtPriceX96ToPrice(
    sqrtPriceX96: BigNumber,
    decimals0: number,
    decimals1: number
): string {
    const Q96 = new FixedMathBN(2).pow(96);
    const sqrtPrice = new FixedMathBN(sqrtPriceX96.toString());

    // price = (sqrtPrice / 2^96)^2
    const price = sqrtPrice.dividedBy(Q96).pow(2);

    // Adjust for decimal differences
    const decimalAdjustment = new FixedMathBN(10).pow(decimals0 - decimals1);
    const adjustedPrice = price.multipliedBy(decimalAdjustment);

    return adjustedPrice.toString();
}

// Example: USDT (6 decimals) / WVC (18 decimals)
const humanPrice = sqrtPriceX96ToPrice(sqrtPriceX96, 6, 18);
console.log('Price:', humanPrice, 'USDT per WVC');
```

## Relationship to Uniswap SDK

The VinuSwap SDK utilities are designed to work alongside the Uniswap V3 SDK. For additional functionality like:

- Tick math (`nearestUsableTick`, `priceToClosestTick`, etc.)
- Path encoding for multi-hop swaps
- Liquidity calculations
- Position management

Use the `@uniswap/v3-sdk` package directly, with `withCustomTickSpacing` when needed:

```typescript
import { nearestUsableTick, priceToClosestTick, encodeSqrtRatioX96 } from '@uniswap/v3-sdk';
import { withCustomTickSpacing } from './sdk/utils';

// Use Uniswap SDK functions with custom tick spacing
const usableTick = await withCustomTickSpacing(3000, 60, () => {
    return nearestUsableTick(75862, 60);
});
```

## Related

- [VinuSwap Class](vinuswap-class.md)
- [Getting Started](getting-started.md)
- [@uniswap/v3-sdk Documentation](https://docs.uniswap.org/sdk/v3/overview)
