# VinuSwapQuoter

The VinuSwapQuoter simulates swaps to return expected amounts without executing on-chain.

**Source:** `contracts/periphery/VinuSwapQuoter.sol`

## Overview

The quoter:
- Estimates swap output amounts
- Returns price impact information
- Provides gas cost estimates via tick crossing counts
- Uses a revert-based simulation pattern

## How It Works

The quoter performs a "dry run" of swaps by:
1. Calling the pool's swap function
2. Reverting in the callback with encoded results
3. Catching the revert and decoding the results

This allows simulation without state changes or token transfers.

## Functions

### quoteExactInputSingle

```solidity
function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
    external
    returns (
        uint256 amountOut,
        uint160 sqrtPriceX96After,
        uint32 initializedTicksCrossed,
        uint256 gasEstimate
    )
```

Quotes the output amount for an exact input single swap.

**Parameters Struct:**

```solidity
struct QuoteExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint24 fee;
    uint160 sqrtPriceLimitX96;
}
```

| Name | Type | Description |
|------|------|-------------|
| `tokenIn` | `address` | Input token address |
| `tokenOut` | `address` | Output token address |
| `amountIn` | `uint256` | Exact input amount |
| `fee` | `uint24` | Pool fee tier |
| `sqrtPriceLimitX96` | `uint160` | Price limit (0 for none) |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountOut` | `uint256` | Expected output amount |
| `sqrtPriceX96After` | `uint160` | Price after swap |
| `initializedTicksCrossed` | `uint32` | Number of ticks crossed |
| `gasEstimate` | `uint256` | Estimated gas cost |

**Example:**

```javascript
const params = {
    tokenIn: WVC,
    tokenOut: USDT,
    amountIn: ethers.utils.parseEther('1'),
    fee: 3000,
    sqrtPriceLimitX96: 0
};

const [amountOut, priceAfter, ticksCrossed, gas] = await quoter.callStatic.quoteExactInputSingle(params);

console.log('Expected output:', ethers.utils.formatUnits(amountOut, 6), 'USDT');
console.log('Ticks crossed:', ticksCrossed.toString());
```

---

### quoteExactInput

```solidity
function quoteExactInput(
    bytes memory path,
    uint256 amountIn
) external override returns (
    uint256 amountOut,
    uint160[] memory sqrtPriceX96AfterList,
    uint32[] memory initializedTicksCrossedList,
    uint256 gasEstimate
)
```

Quotes the output amount for a multi-hop exact input swap.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `path` | `bytes` | Encoded swap path |
| `amountIn` | `uint256` | Exact input amount |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountOut` | `uint256` | Expected final output |
| `sqrtPriceX96AfterList` | `uint160[]` | Prices after each hop |
| `initializedTicksCrossedList` | `uint32[]` | Ticks crossed per hop |
| `gasEstimate` | `uint256` | Total estimated gas |

**Example:**

```javascript
// Path: WVC → USDT → TOKEN_C
const path = encodePath([WVC, USDT, TOKEN_C], [3000, 500]);

const [amountOut, prices, ticks, gas] = await quoter.callStatic.quoteExactInput(
    path,
    ethers.utils.parseEther('1')
);
```

---

### quoteExactOutputSingle

```solidity
function quoteExactOutputSingle(QuoteExactOutputSingleParams memory params)
    external
    returns (
        uint256 amountIn,
        uint160 sqrtPriceX96After,
        uint32 initializedTicksCrossed,
        uint256 gasEstimate
    )
```

Quotes the input amount needed for an exact output single swap.

**Parameters Struct:**

```solidity
struct QuoteExactOutputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amount;
    uint24 fee;
    uint160 sqrtPriceLimitX96;
}
```

| Name | Type | Description |
|------|------|-------------|
| `tokenIn` | `address` | Input token address |
| `tokenOut` | `address` | Output token address |
| `amount` | `uint256` | Exact output amount wanted |
| `fee` | `uint24` | Pool fee tier |
| `sqrtPriceLimitX96` | `uint160` | Price limit (0 for none) |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountIn` | `uint256` | Required input amount |
| `sqrtPriceX96After` | `uint160` | Price after swap |
| `initializedTicksCrossed` | `uint32` | Number of ticks crossed |
| `gasEstimate` | `uint256` | Estimated gas cost |

**Example:**

```javascript
const params = {
    tokenIn: WVC,
    tokenOut: USDT,
    amount: ethers.utils.parseUnits('100', 6),  // Want exactly 100 USDT
    fee: 3000,
    sqrtPriceLimitX96: 0
};

const [amountIn, priceAfter, ticksCrossed, gas] = await quoter.callStatic.quoteExactOutputSingle(params);

console.log('Required input:', ethers.utils.formatEther(amountIn), 'WVC');
```

---

### quoteExactOutput

```solidity
function quoteExactOutput(
    bytes memory path,
    uint256 amountOut
) external override returns (
    uint256 amountIn,
    uint160[] memory sqrtPriceX96AfterList,
    uint32[] memory initializedTicksCrossedList,
    uint256 gasEstimate
)
```

Quotes the input amount needed for a multi-hop exact output swap.

**Note:** Path is encoded in **reverse order** (output token first).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `path` | `bytes` | Encoded swap path (reversed) |
| `amountOut` | `uint256` | Exact output amount wanted |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountIn` | `uint256` | Required input amount |
| `sqrtPriceX96AfterList` | `uint160[]` | Prices after each hop |
| `initializedTicksCrossedList` | `uint32[]` | Ticks crossed per hop |
| `gasEstimate` | `uint256` | Total estimated gas |

## Path Encoding

### Exact Input Path

Encode tokens and fees in order:

```javascript
function encodePath(tokens, fees) {
    let path = '0x';
    for (let i = 0; i < fees.length; i++) {
        path += tokens[i].slice(2);
        path += fees[i].toString(16).padStart(6, '0');
    }
    path += tokens[tokens.length - 1].slice(2);
    return path;
}

// WVC → USDT → TOKEN_C
const path = encodePath([WVC, USDT, TOKEN_C], [3000, 500]);
```

### Exact Output Path (Reversed)

```javascript
// Want WVC → USDT → TOKEN_C, encode as TOKEN_C → USDT → WVC
const path = encodePath([TOKEN_C, USDT, WVC], [500, 3000]);
```

## Understanding Return Values

### sqrtPriceX96After

The pool price after the swap in Q64.96 format:

```javascript
const priceAfter = (sqrtPriceX96After / (2 ** 96)) ** 2;
```

### initializedTicksCrossed

Number of tick boundaries crossed. Useful for:
- Estimating gas costs (more ticks = more gas)
- Understanding liquidity depth

### gasEstimate

Estimated gas cost based on:
- Base swap cost
- Per-tick crossing cost
- Path length (for multi-hop)

## Usage Patterns

### Compare Routes

```javascript
async function findBestRoute(tokenIn, tokenOut, amountIn) {
    const routes = [
        { path: [tokenIn, tokenOut], fees: [500] },
        { path: [tokenIn, tokenOut], fees: [3000] },
        { path: [tokenIn, USDT, tokenOut], fees: [3000, 500] }
    ];

    let best = { amountOut: BigNumber.from(0) };

    for (const route of routes) {
        try {
            const path = encodePath(route.path, route.fees);
            const [amountOut] = await quoter.callStatic.quoteExactInput(path, amountIn);

            if (amountOut.gt(best.amountOut)) {
                best = { amountOut, route };
            }
        } catch {
            // Route doesn't exist or insufficient liquidity
        }
    }

    return best;
}
```

### Calculate Slippage

```javascript
async function getSwapWithSlippage(tokenIn, tokenOut, fee, amountIn, slippageBps) {
    const params = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
    };

    const [expectedOut] = await quoter.callStatic.quoteExactInputSingle(params);

    const minOut = expectedOut.mul(10000 - slippageBps).div(10000);

    return {
        expectedOut,
        minOut,
        slippagePercent: slippageBps / 100
    };
}

// Usage: 0.5% slippage
const { expectedOut, minOut } = await getSwapWithSlippage(
    WVC, USDT, 3000, ethers.utils.parseEther('1'), 50
);
```

### Estimate Gas Cost

```javascript
const params = {
    tokenIn: WVC,
    tokenOut: USDT,
    amountIn: ethers.utils.parseEther('10'),
    fee: 3000,
    sqrtPriceLimitX96: 0
};

const [amountOut, , ticksCrossed, gasEstimate] = await quoter.callStatic.quoteExactInputSingle(params);

const gasPrice = await provider.getGasPrice();
const gasCost = gasEstimate.mul(gasPrice);

console.log('Estimated gas cost:', ethers.utils.formatEther(gasCost), 'VC');
```

## Important Notes

### Static Calls Required

Always use `callStatic` when calling quoter functions:

```javascript
// Correct
const result = await quoter.callStatic.quoteExactInputSingle(...);

// Incorrect - will revert
const result = await quoter.quoteExactInputSingle(...);
```

### No State Changes

Quotes are simulations. Actual swap amounts may differ due to:
- Price movements between quote and execution
- MEV/frontrunning
- Fee manager changes

### Gas Limitations

Large swaps crossing many ticks may exceed block gas limits in simulation. Consider splitting into smaller amounts.

## Interface

```solidity
interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    struct QuoteExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amount;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );

    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (
            uint256 amountOut,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        );

    function quoteExactOutputSingle(QuoteExactOutputSingleParams memory params)
        external
        returns (
            uint256 amountIn,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );

    function quoteExactOutput(bytes memory path, uint256 amountOut)
        external
        returns (
            uint256 amountIn,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        );
}
```

## Related

- [SwapRouter](swap-router.md)
- [Using the Quoter Guide](../../guides/quoting.md)
- [VinuSwapPool](../core/pool.md)
