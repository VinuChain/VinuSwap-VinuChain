# Using the Quoter

The VinuSwapQuoter simulates swaps to provide expected amounts without executing on-chain.

## Overview

The quoter helps you:
- Get expected output amounts before swapping
- Calculate required input for exact output swaps
- Estimate gas costs
- Compare routes

## Basic Quoting

### Quote Exact Input (Single Hop)

```javascript
async function quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn) {
    // IMPORTANT: Use callStatic for view-like behavior
    const [amountOut, sqrtPriceX96After, ticksCrossed, gasEstimate] =
        await quoter.callStatic.quoteExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            0  // sqrtPriceLimitX96: 0 for no limit
        );

    return {
        amountOut,
        priceImpact: calculatePriceImpact(amountIn, amountOut, sqrtPriceX96After),
        ticksCrossed,
        gasEstimate
    };
}

// Usage
const quote = await quoteExactInputSingle(
    WETH,
    USDC,
    3000,
    ethers.utils.parseEther('1')
);

console.log('Expected output:', ethers.utils.formatUnits(quote.amountOut, 6), 'USDC');
```

### Quote Exact Output (Single Hop)

```javascript
async function quoteExactOutputSingle(tokenIn, tokenOut, fee, amountOut) {
    const [amountIn, sqrtPriceX96After, ticksCrossed, gasEstimate] =
        await quoter.callStatic.quoteExactOutputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            0
        );

    return {
        amountIn,
        sqrtPriceX96After,
        ticksCrossed,
        gasEstimate
    };
}

// Usage: How much WETH needed for 2000 USDC?
const quote = await quoteExactOutputSingle(
    WETH,
    USDC,
    3000,
    ethers.utils.parseUnits('2000', 6)
);

console.log('Required input:', ethers.utils.formatEther(quote.amountIn), 'WETH');
```

## Multi-Hop Quoting

### Path Encoding

```javascript
function encodePath(tokens, fees) {
    let path = '0x';
    for (let i = 0; i < fees.length; i++) {
        path += tokens[i].slice(2).toLowerCase();
        path += fees[i].toString(16).padStart(6, '0');
    }
    path += tokens[tokens.length - 1].slice(2).toLowerCase();
    return path;
}

// WETH → USDC → DAI
const path = encodePath([WETH, USDC, DAI], [3000, 500]);
```

### Quote Multi-Hop Exact Input

```javascript
async function quoteExactInput(path, amountIn) {
    const [amountOut, sqrtPriceX96AfterList, ticksCrossedList, gasEstimate] =
        await quoter.callStatic.quoteExactInput(path, amountIn);

    return {
        amountOut,
        hops: sqrtPriceX96AfterList.map((price, i) => ({
            sqrtPriceX96After: price,
            ticksCrossed: ticksCrossedList[i]
        })),
        gasEstimate
    };
}
```

### Quote Multi-Hop Exact Output

**Note:** Path is reversed for exact output.

```javascript
async function quoteExactOutput(tokenPath, fees, amountOut) {
    // Reverse for exact output
    const reversedPath = encodePath(
        [...tokenPath].reverse(),
        [...fees].reverse()
    );

    const [amountIn, sqrtPriceX96AfterList, ticksCrossedList, gasEstimate] =
        await quoter.callStatic.quoteExactOutput(reversedPath, amountOut);

    return { amountIn, gasEstimate };
}
```

## Route Comparison

### Find Best Route

```javascript
async function findBestRoute(tokenIn, tokenOut, amountIn) {
    const routes = [
        // Direct routes with different fee tiers
        { path: [tokenIn, tokenOut], fees: [100] },   // 0.01%
        { path: [tokenIn, tokenOut], fees: [500] },   // 0.05%
        { path: [tokenIn, tokenOut], fees: [3000] },  // 0.3%
        { path: [tokenIn, tokenOut], fees: [10000] }, // 1%

        // Two-hop routes
        { path: [tokenIn, WETH, tokenOut], fees: [3000, 3000] },
        { path: [tokenIn, USDC, tokenOut], fees: [500, 500] },
        { path: [tokenIn, WETH, tokenOut], fees: [500, 3000] },
    ];

    const results = [];

    for (const route of routes) {
        try {
            let amountOut, gasEstimate;

            if (route.path.length === 2) {
                [amountOut, , , gasEstimate] = await quoter.callStatic.quoteExactInputSingle(
                    route.path[0], route.path[1], route.fees[0], amountIn, 0
                );
            } else {
                const path = encodePath(route.path, route.fees);
                [amountOut, , , gasEstimate] = await quoter.callStatic.quoteExactInput(
                    path, amountIn
                );
            }

            results.push({
                route,
                amountOut,
                gasEstimate
            });
        } catch (e) {
            // Route doesn't exist or insufficient liquidity
            continue;
        }
    }

    // Sort by output amount (descending)
    results.sort((a, b) => b.amountOut.sub(a.amountOut).gt(0) ? 1 : -1);

    return results;
}
```

### Compare Gas Costs

```javascript
async function compareRoutesWithGas(tokenIn, tokenOut, amountIn) {
    const routes = await findBestRoute(tokenIn, tokenOut, amountIn);
    const gasPrice = await provider.getGasPrice();

    return routes.map(r => ({
        ...r,
        gasCostWei: r.gasEstimate.mul(gasPrice),
        gasCostETH: ethers.utils.formatEther(r.gasEstimate.mul(gasPrice)),
        // Net output = amountOut - gasCost (if output is ETH)
        netOutput: r.amountOut.sub(r.gasEstimate.mul(gasPrice))
    }));
}
```

## Price Impact Calculation

### Calculate Price Impact

```javascript
function calculatePriceImpact(amountIn, amountOut, sqrtPriceX96After) {
    // Get price before (from pool)
    const priceBefore = getCurrentPrice();

    // Get price after from quote
    const priceAfter = sqrtPriceX96ToPrice(sqrtPriceX96After);

    // Calculate impact
    const impact = Math.abs(priceAfter - priceBefore) / priceBefore * 100;

    return impact;
}

function sqrtPriceX96ToPrice(sqrtPriceX96) {
    const Q96 = BigNumber.from(2).pow(96);
    const sqrtPrice = sqrtPriceX96.mul(sqrtPriceX96).div(Q96);
    return sqrtPrice.div(Q96).toNumber();
}
```

### Warning Thresholds

```javascript
function getPriceImpactSeverity(impact) {
    if (impact < 0.1) return { level: 'low', color: 'green' };
    if (impact < 1) return { level: 'medium', color: 'yellow' };
    if (impact < 5) return { level: 'high', color: 'orange' };
    return { level: 'severe', color: 'red' };
}
```

## Building a Quote Interface

### Full Quote Function

```javascript
async function getFullQuote(
    tokenIn,
    tokenOut,
    amountIn,
    slippagePercent = 0.5
) {
    // Find best route
    const routes = await findBestRoute(tokenIn, tokenOut, amountIn);

    if (routes.length === 0) {
        throw new Error('No route found');
    }

    const best = routes[0];

    // Calculate slippage
    const slippageBps = slippagePercent * 100;
    const minAmountOut = best.amountOut.mul(10000 - slippageBps).div(10000);

    // Get gas cost
    const gasPrice = await provider.getGasPrice();
    const gasCostWei = best.gasEstimate.mul(gasPrice);

    return {
        route: best.route,
        amountIn,
        expectedOutput: best.amountOut,
        minimumOutput: minAmountOut,
        slippage: slippagePercent,
        gasEstimate: best.gasEstimate,
        gasCostWei,
        gasCostETH: ethers.utils.formatEther(gasCostWei)
    };
}
```

### React Hook Example

```javascript
function useQuote(tokenIn, tokenOut, amountIn) {
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!tokenIn || !tokenOut || !amountIn || amountIn.isZero()) {
            setQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getFullQuote(tokenIn, tokenOut, amountIn);
                setQuote(result);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        // Debounce
        const timeoutId = setTimeout(fetchQuote, 300);
        return () => clearTimeout(timeoutId);
    }, [tokenIn, tokenOut, amountIn?.toString()]);

    return { quote, loading, error };
}
```

## Error Handling

```javascript
async function safeQuote(tokenIn, tokenOut, fee, amountIn) {
    try {
        const result = await quoter.callStatic.quoteExactInputSingle(
            tokenIn, tokenOut, fee, amountIn, 0
        );
        return { success: true, ...result };
    } catch (error) {
        // Parse common errors
        if (error.message.includes('Pool does not exist')) {
            return { success: false, error: 'No pool for this pair/fee' };
        }
        if (error.message.includes('not enough liquidity')) {
            return { success: false, error: 'Insufficient liquidity' };
        }
        return { success: false, error: error.message };
    }
}
```

## Caching Quotes

```javascript
class QuoteCache {
    constructor(ttlMs = 10000) {
        this.cache = new Map();
        this.ttl = ttlMs;
    }

    getCacheKey(tokenIn, tokenOut, fee, amountIn) {
        return `${tokenIn}-${tokenOut}-${fee}-${amountIn.toString()}`;
    }

    async getQuote(tokenIn, tokenOut, fee, amountIn) {
        const key = this.getCacheKey(tokenIn, tokenOut, fee, amountIn);

        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.ttl) {
            return cached.data;
        }

        const [amountOut, priceAfter, ticks, gas] =
            await quoter.callStatic.quoteExactInputSingle(
                tokenIn, tokenOut, fee, amountIn, 0
            );

        const data = { amountOut, priceAfter, ticks, gas };
        this.cache.set(key, { data, timestamp: Date.now() });

        return data;
    }
}
```

## Best Practices

1. **Always use `callStatic`** - Quoter functions revert with data
2. **Cache quotes** - Reduce RPC calls for repeated queries
3. **Handle failures gracefully** - Routes may not exist
4. **Consider gas costs** - For small trades, multi-hop may not be worth it
5. **Update quotes before execution** - Prices change rapidly

## Related

- [VinuSwapQuoter Reference](../reference/periphery/quoter.md)
- [Executing Swaps](swapping.md)
