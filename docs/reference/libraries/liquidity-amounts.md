# LiquidityAmounts Library

Functions for converting between token amounts and liquidity.

**Source:** `contracts/periphery/libraries/LiquidityAmounts.sol`

## Functions

### getLiquidityForAmount0

```solidity
function getLiquidityForAmount0(
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint256 amount0
) internal pure returns (uint128 liquidity)
```

Computes liquidity for a given amount of token0.

### getLiquidityForAmount1

```solidity
function getLiquidityForAmount1(
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint256 amount1
) internal pure returns (uint128 liquidity)
```

Computes liquidity for a given amount of token1.

### getLiquidityForAmounts

```solidity
function getLiquidityForAmounts(
    uint160 sqrtRatioX96,
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint256 amount0,
    uint256 amount1
) internal pure returns (uint128 liquidity)
```

Computes the maximum liquidity for given token amounts based on current price.

**Parameters:**
- `sqrtRatioX96` - Current pool price
- `sqrtRatioAX96` - Lower bound sqrt price
- `sqrtRatioBX96` - Upper bound sqrt price
- `amount0` - Desired token0 amount
- `amount1` - Desired token1 amount

### getAmount0ForLiquidity

```solidity
function getAmount0ForLiquidity(
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint128 liquidity
) internal pure returns (uint256 amount0)
```

Computes token0 amount for a given liquidity.

### getAmount1ForLiquidity

```solidity
function getAmount1ForLiquidity(
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint128 liquidity
) internal pure returns (uint256 amount1)
```

Computes token1 amount for a given liquidity.

### getAmountsForLiquidity

```solidity
function getAmountsForLiquidity(
    uint160 sqrtRatioX96,
    uint160 sqrtRatioAX96,
    uint160 sqrtRatioBX96,
    uint128 liquidity
) internal pure returns (uint256 amount0, uint256 amount1)
```

Computes token amounts for given liquidity based on current price.

## JavaScript Implementation

```javascript
const { BigNumber } = require('ethers');
const { TickMath, FullMath } = require('@uniswap/v3-sdk');

function getLiquidityForAmounts(
    sqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    amount0,
    amount1
) {
    // Ensure A < B
    if (sqrtPriceAX96.gt(sqrtPriceBX96)) {
        [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
    }

    if (sqrtPriceX96.lte(sqrtPriceAX96)) {
        // Price below range - only token0
        return getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
    } else if (sqrtPriceX96.lt(sqrtPriceBX96)) {
        // Price in range
        const liquidity0 = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
        const liquidity1 = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
        return liquidity0.lt(liquidity1) ? liquidity0 : liquidity1;
    } else {
        // Price above range - only token1
        return getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
    }
}

function getAmountsForLiquidity(
    sqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    liquidity
) {
    // Ensure A < B
    if (sqrtPriceAX96.gt(sqrtPriceBX96)) {
        [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
    }

    let amount0 = BigNumber.from(0);
    let amount1 = BigNumber.from(0);

    if (sqrtPriceX96.lte(sqrtPriceAX96)) {
        // Price below range
        amount0 = getAmount0ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, liquidity);
    } else if (sqrtPriceX96.lt(sqrtPriceBX96)) {
        // Price in range
        amount0 = getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceBX96, liquidity);
        amount1 = getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceX96, liquidity);
    } else {
        // Price above range
        amount1 = getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, liquidity);
    }

    return { amount0, amount1 };
}
```

## Usage Example

```javascript
// Calculate liquidity for creating a position
const tickLower = -60000;
const tickUpper = 60000;
const sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(tickLower);
const sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

const amount0 = ethers.utils.parseUnits('1000', 6);  // 1000 USDT
const amount1 = ethers.utils.parseEther('0.5');      // 0.5 WVC

const liquidity = getLiquidityForAmounts(
    currentSqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    amount0,
    amount1
);

console.log('Liquidity:', liquidity.toString());
```

## Related

- [NonfungiblePositionManager](../periphery/position-manager.md)
- [VinuSwapPool](../core/pool.md)
