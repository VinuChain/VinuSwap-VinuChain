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
function quoteExactInputSingle(
    address tokenIn,
    address tokenOut,
    uint24 fee,
    uint256 amountIn,
    uint160 sqrtPriceLimitX96
) external override returns (
    uint256 amountOut,
    uint160 sqrtPriceX96After,
    uint32 initializedTicksCrossed,
    uint256 gasEstimate
)
```

Quotes the output amount for an exact input single swap.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokenIn` | `address` | Input token address |
| `tokenOut` | `address` | Output token address |
| `fee` | `uint24` | Pool fee tier |
| `amountIn` | `uint256` | Exact input amount |
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
const [amountOut, priceAfter, ticksCrossed, gas] = await quoter.callStatic.quoteExactInputSingle(
    WETH,
    USDC,
    3000,
    ethers.utils.parseEther('1'),
    0
);

console.log('Expected output:', ethers.utils.formatUnits(amountOut, 6), 'USDC');
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
// Path: WETH → USDC → DAI
const path = encodePath([WETH, USDC, DAI], [3000, 500]);

const [amountOut, prices, ticks, gas] = await quoter.callStatic.quoteExactInput(
    path,
    ethers.utils.parseEther('1')
);
```

---

### quoteExactOutputSingle

```solidity
function quoteExactOutputSingle(
    address tokenIn,
    address tokenOut,
    uint24 fee,
    uint256 amountOut,
    uint160 sqrtPriceLimitX96
) external override returns (
    uint256 amountIn,
    uint160 sqrtPriceX96After,
    uint32 initializedTicksCrossed,
    uint256 gasEstimate
)
```

Quotes the input amount needed for an exact output single swap.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokenIn` | `address` | Input token address |
| `tokenOut` | `address` | Output token address |
| `fee` | `uint24` | Pool fee tier |
| `amountOut` | `uint256` | Exact output amount wanted |
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
const [amountIn, priceAfter, ticksCrossed, gas] = await quoter.callStatic.quoteExactOutputSingle(
    WETH,
    USDC,
    3000,
    ethers.utils.parseUnits('2000', 6),  // Want exactly 2000 USDC
    0
);

console.log('Required input:', ethers.utils.formatEther(amountIn), 'WETH');
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

// WETH → USDC → DAI
const path = encodePath([WETH, USDC, DAI], [3000, 500]);
```

### Exact Output Path (Reversed)

```javascript
// Want WETH → USDC → DAI, encode as DAI → USDC → WETH
const path = encodePath([DAI, USDC, WETH], [500, 3000]);
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
        { path: [tokenIn, USDC, tokenOut], fees: [3000, 500] }
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
    const [expectedOut] = await quoter.callStatic.quoteExactInputSingle(
        tokenIn, tokenOut, fee, amountIn, 0
    );

    const minOut = expectedOut.mul(10000 - slippageBps).div(10000);

    return {
        expectedOut,
        minOut,
        slippagePercent: slippageBps / 100
    };
}

// Usage: 0.5% slippage
const { expectedOut, minOut } = await getSwapWithSlippage(
    WETH, USDC, 3000, ethers.utils.parseEther('1'), 50
);
```

### Estimate Gas Cost

```javascript
const [amountOut, , ticksCrossed, gasEstimate] = await quoter.callStatic.quoteExactInputSingle(
    WETH, USDC, 3000, ethers.utils.parseEther('10'), 0
);

const gasPrice = await provider.getGasPrice();
const gasCost = gasEstimate.mul(gasPrice);

console.log('Estimated gas cost:', ethers.utils.formatEther(gasCost), 'ETH');
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
interface IVinuSwapQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (
        uint256 amountOut,
        uint160 sqrtPriceX96After,
        uint32 initializedTicksCrossed,
        uint256 gasEstimate
    );

    function quoteExactInput(
        bytes memory path,
        uint256 amountIn
    ) external returns (
        uint256 amountOut,
        uint160[] memory sqrtPriceX96AfterList,
        uint32[] memory initializedTicksCrossedList,
        uint256 gasEstimate
    );

    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) external returns (
        uint256 amountIn,
        uint160 sqrtPriceX96After,
        uint32 initializedTicksCrossed,
        uint256 gasEstimate
    );

    function quoteExactOutput(
        bytes memory path,
        uint256 amountOut
    ) external returns (
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
