# Executing Swaps

This guide covers implementing token swaps through VinuSwap.

## Overview

VinuSwap supports four swap types:

| Type | Description |
|------|-------------|
| `exactInputSingle` | Swap exact input for minimum output (single pool) |
| `exactInput` | Swap exact input for minimum output (multi-hop) |
| `exactOutputSingle` | Swap maximum input for exact output (single pool) |
| `exactOutput` | Swap maximum input for exact output (multi-hop) |

## Prerequisites

```javascript
const { ethers } = require('ethers');

// Contract addresses (replace with actual)
const SWAP_ROUTER = '0x...';
const QUOTER = '0x...';
const WETH = '0x...';
const USDC = '0x...';

// ABIs
const routerABI = require('./abi/SwapRouter.json');
const quoterABI = require('./abi/VinuSwapQuoter.json');
const erc20ABI = require('./abi/ERC20.json');

// Connect to provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Contract instances
const router = new ethers.Contract(SWAP_ROUTER, routerABI, signer);
const quoter = new ethers.Contract(QUOTER, quoterABI, provider);
```

## Single Swaps

### Exact Input Single

Swap a known amount of input tokens for a minimum amount of output tokens.

```javascript
async function swapExactInputSingle(
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    slippagePercent = 0.5
) {
    // 1. Get quote
    const [quotedAmountOut] = await quoter.callStatic.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        fee,
        amountIn,
        0  // No price limit
    );

    // 2. Calculate minimum output with slippage
    const slippageBps = slippagePercent * 100;
    const amountOutMinimum = quotedAmountOut.mul(10000 - slippageBps).div(10000);

    // 3. Approve router (if not already)
    const token = new ethers.Contract(tokenIn, erc20ABI, signer);
    const allowance = await token.allowance(signer.address, router.address);
    if (allowance.lt(amountIn)) {
        await token.approve(router.address, ethers.constants.MaxUint256);
    }

    // 4. Execute swap
    const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,  // 30 minutes
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0
    };

    const tx = await router.exactInputSingle(params);
    const receipt = await tx.wait();

    return receipt;
}

// Usage: Swap 1 WETH for USDC
const amountIn = ethers.utils.parseEther('1');
await swapExactInputSingle(WETH, USDC, 3000, amountIn);
```

### Exact Output Single

Swap a maximum amount of input tokens for a known amount of output tokens.

```javascript
async function swapExactOutputSingle(
    tokenIn,
    tokenOut,
    fee,
    amountOut,
    slippagePercent = 0.5
) {
    // 1. Get quote for required input
    const [quotedAmountIn] = await quoter.callStatic.quoteExactOutputSingle(
        tokenIn,
        tokenOut,
        fee,
        amountOut,
        0
    );

    // 2. Calculate maximum input with slippage
    const slippageBps = slippagePercent * 100;
    const amountInMaximum = quotedAmountIn.mul(10000 + slippageBps).div(10000);

    // 3. Approve router
    const token = new ethers.Contract(tokenIn, erc20ABI, signer);
    await token.approve(router.address, amountInMaximum);

    // 4. Execute swap
    const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountOut,
        amountInMaximum,
        sqrtPriceLimitX96: 0
    };

    const tx = await router.exactOutputSingle(params);
    const receipt = await tx.wait();

    // 5. Refund excess (router keeps unused input)
    // Note: Router automatically refunds unused tokens

    return receipt;
}

// Usage: Get exactly 2000 USDC
const amountOut = ethers.utils.parseUnits('2000', 6);
await swapExactOutputSingle(WETH, USDC, 3000, amountOut);
```

## Multi-Hop Swaps

### Path Encoding

Multi-hop swaps use an encoded path:

```javascript
function encodePath(tokens, fees) {
    if (tokens.length !== fees.length + 1) {
        throw new Error('Invalid path lengths');
    }

    let path = '0x';
    for (let i = 0; i < fees.length; i++) {
        path += tokens[i].slice(2);
        path += fees[i].toString(16).padStart(6, '0');
    }
    path += tokens[tokens.length - 1].slice(2);

    return path;
}

// Example: WETH → USDC → DAI
const path = encodePath(
    [WETH, USDC, DAI],
    [3000, 500]  // WETH/USDC 0.3%, USDC/DAI 0.05%
);
```

### Exact Input Multi-Hop

```javascript
async function swapExactInput(
    tokens,
    fees,
    amountIn,
    slippagePercent = 0.5
) {
    const path = encodePath(tokens, fees);

    // 1. Get quote
    const [quotedAmountOut] = await quoter.callStatic.quoteExactInput(
        path,
        amountIn
    );

    // 2. Calculate minimum output
    const slippageBps = slippagePercent * 100;
    const amountOutMinimum = quotedAmountOut.mul(10000 - slippageBps).div(10000);

    // 3. Approve router for input token
    const tokenIn = new ethers.Contract(tokens[0], erc20ABI, signer);
    await tokenIn.approve(router.address, amountIn);

    // 4. Execute swap
    const params = {
        path,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountIn,
        amountOutMinimum
    };

    const tx = await router.exactInput(params);
    return await tx.wait();
}

// Usage: Swap WETH → USDC → DAI
await swapExactInput(
    [WETH, USDC, DAI],
    [3000, 500],
    ethers.utils.parseEther('1')
);
```

### Exact Output Multi-Hop

**Note:** For exact output, the path is encoded in **reverse order**.

```javascript
async function swapExactOutput(
    tokens,     // In order: input → ... → output
    fees,
    amountOut,
    slippagePercent = 0.5
) {
    // Reverse path for exact output
    const reversedTokens = [...tokens].reverse();
    const reversedFees = [...fees].reverse();
    const path = encodePath(reversedTokens, reversedFees);

    // 1. Get quote
    const [quotedAmountIn] = await quoter.callStatic.quoteExactOutput(
        path,
        amountOut
    );

    // 2. Calculate maximum input
    const slippageBps = slippagePercent * 100;
    const amountInMaximum = quotedAmountIn.mul(10000 + slippageBps).div(10000);

    // 3. Approve router
    const tokenIn = new ethers.Contract(tokens[0], erc20ABI, signer);
    await tokenIn.approve(router.address, amountInMaximum);

    // 4. Execute swap
    const params = {
        path,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountOut,
        amountInMaximum
    };

    const tx = await router.exactOutput(params);
    return await tx.wait();
}
```

## Swapping with Native Token (ETH)

### ETH → Token

Send ETH with the transaction:

```javascript
async function swapETHForTokens(tokenOut, fee, amountIn) {
    const params = {
        tokenIn: WETH,  // Use WETH address
        tokenOut,
        fee,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountIn,
        amountOutMinimum: 0,  // Add slippage in production
        sqrtPriceLimitX96: 0
    };

    // Send ETH value with transaction
    const tx = await router.exactInputSingle(params, { value: amountIn });
    return await tx.wait();
}
```

### Token → ETH

Use multicall to swap and unwrap:

```javascript
async function swapTokensForETH(tokenIn, fee, amountIn) {
    // Approve
    const token = new ethers.Contract(tokenIn, erc20ABI, signer);
    await token.approve(router.address, amountIn);

    // Swap params - recipient is zero address to trigger unwrap
    const swapParams = {
        tokenIn,
        tokenOut: WETH,
        fee,
        recipient: ethers.constants.AddressZero,  // Will unwrap
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };

    // Encode multicall
    const calls = [
        router.interface.encodeFunctionData('exactInputSingle', [swapParams]),
        router.interface.encodeFunctionData('unwrapWETH9', [
            0,  // amountMinimum (add slippage)
            signer.address  // recipient
        ])
    ];

    const tx = await router.multicall(calls);
    return await tx.wait();
}
```

## Using Permit for Gasless Approvals

If the token supports ERC20 Permit:

```javascript
async function swapWithPermit(tokenIn, tokenOut, fee, amountIn) {
    // Sign permit
    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const nonce = await token.nonces(signer.address);

    const domain = {
        name: await token.name(),
        version: '1',
        chainId: await signer.getChainId(),
        verifyingContract: token.address
    };

    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
        ]
    };

    const value = {
        owner: signer.address,
        spender: router.address,
        value: amountIn,
        nonce,
        deadline
    };

    const signature = await signer._signTypedData(domain, types, value);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    // Multicall: permit + swap
    const calls = [
        router.interface.encodeFunctionData('selfPermit', [
            tokenIn, amountIn, deadline, v, r, s
        ]),
        router.interface.encodeFunctionData('exactInputSingle', [{
            tokenIn,
            tokenOut,
            fee,
            recipient: signer.address,
            deadline,
            amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        }])
    ];

    const tx = await router.multicall(calls);
    return await tx.wait();
}
```

## Finding the Best Route

Compare routes to find optimal path:

```javascript
async function findBestRoute(tokenIn, tokenOut, amountIn) {
    const routes = [
        // Direct routes
        { tokens: [tokenIn, tokenOut], fees: [100] },
        { tokens: [tokenIn, tokenOut], fees: [500] },
        { tokens: [tokenIn, tokenOut], fees: [3000] },
        // Via WETH
        { tokens: [tokenIn, WETH, tokenOut], fees: [3000, 3000] },
        // Via USDC
        { tokens: [tokenIn, USDC, tokenOut], fees: [500, 500] },
    ];

    let bestRoute = null;
    let bestOutput = ethers.BigNumber.from(0);

    for (const route of routes) {
        try {
            let output;
            if (route.tokens.length === 2) {
                [output] = await quoter.callStatic.quoteExactInputSingle(
                    route.tokens[0],
                    route.tokens[1],
                    route.fees[0],
                    amountIn,
                    0
                );
            } else {
                const path = encodePath(route.tokens, route.fees);
                [output] = await quoter.callStatic.quoteExactInput(path, amountIn);
            }

            if (output.gt(bestOutput)) {
                bestOutput = output;
                bestRoute = route;
            }
        } catch (e) {
            // Route doesn't exist or has insufficient liquidity
            continue;
        }
    }

    return { route: bestRoute, output: bestOutput };
}
```

## Error Handling

```javascript
async function safeSwap(params) {
    try {
        const tx = await router.exactInputSingle(params);
        const receipt = await tx.wait();

        if (receipt.status === 0) {
            throw new Error('Transaction reverted');
        }

        return receipt;
    } catch (error) {
        if (error.message.includes('Too little received')) {
            throw new Error('Slippage tolerance exceeded');
        }
        if (error.message.includes('Transaction too old')) {
            throw new Error('Transaction deadline exceeded');
        }
        if (error.message.includes('STF')) {
            throw new Error('Insufficient token balance or allowance');
        }
        throw error;
    }
}
```

## Next Steps

- [Providing Liquidity](providing-liquidity.md)
- [Using the Quoter](quoting.md)
- [SwapRouter Reference](../reference/periphery/swap-router.md)
