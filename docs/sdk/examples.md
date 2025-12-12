# SDK Examples

Complete examples for common VinuSwap operations.

## Basic Setup

```typescript
import { ethers } from 'ethers';
import { VinuSwap } from './sdk/core';
import { encodePrice, priceToTick, nearestUsableTick } from './sdk/utils';

// Configuration
const config = {
    rpcUrl: 'https://rpc.vinuchain.org',
    pool: '0x...',
    quoter: '0x...',
    router: '0x...',
    positionManager: '0x...',
    weth: '0x...',
    usdc: '0x...'
};

// Setup
const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

async function getSDK() {
    const sdk = await VinuSwap.create(
        config.weth,
        config.usdc,
        config.pool,
        config.quoter,
        config.router,
        config.positionManager,
        provider
    );
    return sdk.connect(signer);
}
```

## Swap Examples

### Simple Swap

```typescript
async function simpleSwap() {
    const sdk = await getSDK();

    // Swap 0.1 ETH for USDC
    const amountIn = ethers.utils.parseEther('0.1');

    // Get quote first
    const quote = await sdk.getQuote(config.weth, config.usdc, amountIn);
    console.log('Expected:', ethers.utils.formatUnits(quote.amountOut, 6), 'USDC');

    // Calculate minimum with 0.5% slippage
    const minOut = quote.amountOut.mul(9950).div(10000);

    // Execute swap
    const result = await sdk.swap(
        config.weth,
        config.usdc,
        amountIn,
        minOut,
        Math.floor(Date.now() / 1000) + 1800
    );

    console.log('Swap executed:', result.hash);
    console.log('Received:', ethers.utils.formatUnits(result.amountOut, 6), 'USDC');
}
```

### Swap with Price Limit

```typescript
async function swapWithPriceLimit() {
    const sdk = await getSDK();

    const amountIn = ethers.utils.parseEther('1');

    // Set price limit (won't swap beyond this price)
    const maxPrice = 2100; // Max 2100 USDC per ETH
    const sqrtPriceLimitX96 = encodePrice(maxPrice);

    const result = await sdk.router.exactInputSingle({
        tokenIn: config.weth,
        tokenOut: config.usdc,
        fee: 3000,
        recipient: await signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96
    });

    console.log('Swap executed with price limit');
}
```

### Multi-Hop Swap

```typescript
async function multiHopSwap() {
    const sdk = await getSDK();
    const DAI = '0x...';

    // Swap WETH → USDC → DAI
    const path = encodePath(
        [config.weth, config.usdc, DAI],
        [3000, 500]
    );

    const amountIn = ethers.utils.parseEther('0.5');

    // Get quote
    const [amountOut] = await sdk.quoter.callStatic.quoteExactInput(
        path,
        amountIn
    );

    // Execute multi-hop swap
    const tx = await sdk.router.exactInput({
        path,
        recipient: await signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountIn,
        amountOutMinimum: amountOut.mul(99).div(100)
    });

    await tx.wait();
    console.log('Multi-hop swap completed');
}
```

## Liquidity Examples

### Create Position

```typescript
async function createPosition() {
    const sdk = await getSDK();

    // Define price range: $1,900 to $2,100
    const tickSpacing = 60;
    const tickLower = nearestUsableTick(priceToTick(1900), tickSpacing);
    const tickUpper = nearestUsableTick(priceToTick(2100), tickSpacing);

    // Amounts to add
    const amount0 = ethers.utils.parseUnits('1000', 6);  // 1000 USDC
    const amount1 = ethers.utils.parseEther('0.5');       // 0.5 ETH

    // Approve tokens
    await sdk.token0Contract.approve(config.positionManager, amount0);
    await sdk.token1Contract.approve(config.positionManager, amount1);

    // Mint position
    const result = await sdk.mint(
        tickLower,
        tickUpper,
        amount0,
        amount1,
        0,
        0,
        Math.floor(Date.now() / 1000) + 1800
    );

    console.log('Position created!');
    console.log('Token ID:', result.tokenId.toString());
    console.log('Liquidity:', result.liquidity.toString());
    console.log('Amount0 used:', ethers.utils.formatUnits(result.amount0, 6));
    console.log('Amount1 used:', ethers.utils.formatEther(result.amount1));
}
```

### Add to Existing Position

```typescript
async function addLiquidity(tokenId: ethers.BigNumber) {
    const sdk = await getSDK();

    const additionalAmount0 = ethers.utils.parseUnits('500', 6);
    const additionalAmount1 = ethers.utils.parseEther('0.25');

    // Approve
    await sdk.token0Contract.approve(config.positionManager, additionalAmount0);
    await sdk.token1Contract.approve(config.positionManager, additionalAmount1);

    // Increase liquidity
    const result = await sdk.increaseLiquidity(
        tokenId,
        additionalAmount0,
        additionalAmount1,
        0,
        0,
        Math.floor(Date.now() / 1000) + 1800
    );

    console.log('Liquidity increased!');
    console.log('New liquidity:', result.liquidity.toString());
}
```

### Collect Fees

```typescript
async function collectFees(tokenId: ethers.BigNumber) {
    const sdk = await getSDK();
    const recipient = await signer.getAddress();

    const result = await sdk.collect(
        tokenId,
        recipient,
        ethers.constants.MaxUint128,
        ethers.constants.MaxUint128
    );

    console.log('Fees collected!');
    console.log('Token0:', ethers.utils.formatUnits(result.amount0, 6));
    console.log('Token1:', ethers.utils.formatEther(result.amount1));
}
```

### Close Position

```typescript
async function closePosition(tokenId: ethers.BigNumber) {
    const sdk = await getSDK();

    // Get position info
    const position = await sdk.positionManager.positions(tokenId);

    // 1. Remove all liquidity
    if (position.liquidity.gt(0)) {
        await sdk.decreaseLiquidity(
            tokenId,
            position.liquidity,
            0,
            0,
            Math.floor(Date.now() / 1000) + 1800
        );
    }

    // 2. Collect all tokens
    await sdk.collect(
        tokenId,
        await signer.getAddress(),
        ethers.constants.MaxUint128,
        ethers.constants.MaxUint128
    );

    // 3. Burn the NFT
    await sdk.positionManager.burn(tokenId);

    console.log('Position closed and burned');
}
```

## Pool Monitoring

### Watch Pool State

```typescript
async function monitorPool() {
    const sdk = await getSDK();

    // Get initial state
    const state = await sdk.getPoolState();
    console.log('Current tick:', state.tick);
    console.log('Current liquidity:', state.liquidity.toString());

    // Subscribe to swap events
    sdk.pool.on('Swap', (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick) => {
        console.log('Swap detected!');
        console.log('  New tick:', tick);
        console.log('  Amount0:', amount0.toString());
        console.log('  Amount1:', amount1.toString());
    });

    console.log('Monitoring swaps...');
}
```

### Get Position Value

```typescript
async function getPositionValue(tokenId: ethers.BigNumber) {
    const sdk = await getSDK();

    const position = await sdk.positionManager.positions(tokenId);
    const state = await sdk.getPoolState();

    // Calculate token amounts
    const { amount0, amount1 } = getAmountsForLiquidity(
        state.sqrtPriceX96,
        getSqrtRatioAtTick(position.tickLower),
        getSqrtRatioAtTick(position.tickUpper),
        position.liquidity
    );

    // Get token prices
    const price = decodePrice(state.sqrtPriceX96);

    // Calculate total value in token1
    const value0InToken1 = amount0.mul(Math.floor(price * 1e6)).div(1e6);
    const totalValue = value0InToken1.add(amount1);

    console.log('Position value:');
    console.log('  Token0:', ethers.utils.formatUnits(amount0, 6));
    console.log('  Token1:', ethers.utils.formatEther(amount1));
    console.log('  Total (in token1):', ethers.utils.formatEther(totalValue));
}
```

## Error Handling

```typescript
async function safeOperation() {
    const sdk = await getSDK();

    try {
        await sdk.swap(...);
    } catch (error: any) {
        // Parse error
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error('Not enough ETH for gas');
        } else if (error.message.includes('STF')) {
            console.error('Transfer failed - check token balance and allowance');
        } else if (error.message.includes('Too little received')) {
            console.error('Slippage too high - try increasing tolerance');
        } else if (error.message.includes('Transaction too old')) {
            console.error('Transaction expired - try again');
        } else if (error.message.includes('Locked')) {
            console.error('Position is locked');
        } else {
            console.error('Unknown error:', error.message);
        }
    }
}
```

## Full DApp Example

```typescript
class VinuSwapDApp {
    private sdk: VinuSwap | null = null;

    async connect(signer: ethers.Signer) {
        const base = await VinuSwap.create(
            config.weth,
            config.usdc,
            config.pool,
            config.quoter,
            config.router,
            config.positionManager,
            signer.provider!
        );
        this.sdk = base.connect(signer);
        return this.getAddress();
    }

    async getAddress() {
        return this.sdk?.signer?.getAddress();
    }

    async getBalances() {
        if (!this.sdk) throw new Error('Not connected');
        const address = await this.getAddress();

        const [bal0, bal1] = await Promise.all([
            this.sdk.token0Contract.balanceOf(address),
            this.sdk.token1Contract.balanceOf(address)
        ]);

        return { token0: bal0, token1: bal1 };
    }

    async getQuote(amountIn: ethers.BigNumber) {
        if (!this.sdk) throw new Error('Not connected');
        return this.sdk.getQuote(config.weth, config.usdc, amountIn);
    }

    async swap(amountIn: ethers.BigNumber, slippage: number = 0.5) {
        if (!this.sdk) throw new Error('Not connected');

        const quote = await this.getQuote(amountIn);
        const minOut = quote.amountOut.mul(10000 - slippage * 100).div(10000);

        return this.sdk.swap(
            config.weth,
            config.usdc,
            amountIn,
            minOut,
            Math.floor(Date.now() / 1000) + 1800
        );
    }

    async getPositions() {
        if (!this.sdk) throw new Error('Not connected');
        const address = await this.getAddress();

        const balance = await this.sdk.positionManager.balanceOf(address);
        const positions = [];

        for (let i = 0; i < balance.toNumber(); i++) {
            const tokenId = await this.sdk.positionManager.tokenOfOwnerByIndex(address, i);
            const position = await this.sdk.positionManager.positions(tokenId);
            positions.push({ tokenId, ...position });
        }

        return positions;
    }
}

// Usage
const dapp = new VinuSwapDApp();
await dapp.connect(signer);
const quote = await dapp.getQuote(ethers.utils.parseEther('1'));
console.log('Quote:', quote);
```
