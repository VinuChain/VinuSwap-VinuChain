# Pool Creation

Guide for creating and initializing VinuSwap pools after contract deployment.

## Creating Pools

Pools are created through the Controller (which owns the Factory).

### Via Controller

```typescript
async function createPool(
    controller: Contract,
    tokenA: string,
    tokenB: string,
    fee: number,
    tickSpacing: number,
    feeManager: string
) {
    const tx = await controller.createPool(
        tokenA,
        tokenB,
        fee,
        tickSpacing,
        feeManager
    );

    const receipt = await tx.wait();
    const event = receipt.events.find((e: any) => e.event === 'PoolCreated');
    const poolAddress = event.args.pool;

    console.log('Pool created:', poolAddress);
    return poolAddress;
}
```

### Common Pool Configurations

| Pair Type | Fee (bps) | Tick Spacing | Use Case |
|-----------|-----------|--------------|----------|
| Stable-Stable | 100 | 1 | USDC/USDT, DAI/USDC |
| Stable-Major | 500 | 10 | USDC/WETH |
| Standard | 3000 | 60 | Most pairs |
| Volatile | 10000 | 200 | Long-tail assets |

### Example Pool Creation Script

```typescript
// scripts/create_pools.ts
async function main() {
    const [deployer] = await ethers.getSigners();

    // Deployed addresses
    const CONTROLLER = '0x...';
    const FEE_MANAGER = '0x...';

    // Tokens
    const WETH = '0x...';
    const USDC = '0x...';
    const DAI = '0x...';
    const USDT = '0x...';

    const controller = await ethers.getContractAt('Controller', CONTROLLER);

    // Pool configurations
    const pools = [
        {
            name: 'WETH/USDC',
            tokenA: WETH,
            tokenB: USDC,
            fee: 3000,      // 0.3%
            tickSpacing: 60,
            initialPrice: 2000  // 1 WETH = 2000 USDC
        },
        {
            name: 'WETH/DAI',
            tokenA: WETH,
            tokenB: DAI,
            fee: 3000,
            tickSpacing: 60,
            initialPrice: 2000
        },
        {
            name: 'USDC/DAI',
            tokenA: USDC,
            tokenB: DAI,
            fee: 500,       // 0.05%
            tickSpacing: 10,
            initialPrice: 1  // 1:1
        },
        {
            name: 'USDC/USDT',
            tokenA: USDC,
            tokenB: USDT,
            fee: 100,       // 0.01%
            tickSpacing: 1,
            initialPrice: 1
        }
    ];

    const deployed: Record<string, string> = {};

    for (const pool of pools) {
        console.log(`\nCreating ${pool.name} pool...`);

        // Create pool
        const tx = await controller.createPool(
            pool.tokenA,
            pool.tokenB,
            pool.fee,
            pool.tickSpacing,
            FEE_MANAGER
        );

        const receipt = await tx.wait();
        const event = receipt.events.find((e: any) => e.event === 'PoolCreated');
        const poolAddress = event.args.pool;

        console.log(`  Pool address: ${poolAddress}`);
        deployed[pool.name.replace('/', '_')] = poolAddress;

        // Initialize pool
        const sqrtPriceX96 = encodeSqrtRatioX96(pool.initialPrice);
        await controller.initialize(poolAddress, sqrtPriceX96);
        console.log(`  Initialized at price ${pool.initialPrice}`);

        // Set protocol fee
        await controller.setFeeProtocol(poolAddress, 5, 5);  // 20%
        console.log('  Protocol fee set to 20%');
    }

    console.log('\n=== Pools Created ===');
    console.log(JSON.stringify(deployed, null, 2));
}
```

## Initializing Pools

### Price Encoding

Convert human-readable price to sqrtPriceX96:

```typescript
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk';

// For token0/token1 price
function encodePriceForPool(
    price: number,
    token0Decimals: number,
    token1Decimals: number
): BigNumber {
    // Adjust for decimals
    const adjustedPrice = price * (10 ** token1Decimals) / (10 ** token0Decimals);
    return encodeSqrtRatioX96(
        Math.floor(adjustedPrice * 1e18),
        1e18
    );
}

// Example: USDC (6 decimals) / WETH (18 decimals)
// Price: 1 WETH = 2000 USDC
// token0 = USDC, token1 = WETH (sorted by address)
const sqrtPriceX96 = encodePriceForPool(2000, 6, 18);
```

### Simple Price Encoding

```typescript
function encodePrice(price: number): BigNumber {
    const Q96 = BigNumber.from(2).pow(96);
    const sqrtPrice = Math.sqrt(price);
    return BigNumber.from(Math.floor(sqrtPrice * Number(Q96)));
}

// For 1:1 price
const oneToOne = encodePrice(1);

// For 2000:1 (WETH/USDC)
const wethUsdc = encodePrice(2000);
```

### Initialize via Controller

```typescript
async function initializePool(
    controller: Contract,
    poolAddress: string,
    initialPrice: number
) {
    const sqrtPriceX96 = encodePrice(initialPrice);
    await controller.initialize(poolAddress, sqrtPriceX96);
}
```

### Initialize Directly on Pool

```typescript
async function initializePoolDirect(
    poolAddress: string,
    initialPrice: number
) {
    const pool = await ethers.getContractAt('VinuSwapPool', poolAddress);
    const sqrtPriceX96 = encodePrice(initialPrice);
    await pool.initialize(sqrtPriceX96);
}
```

## Setting Protocol Fees

Protocol fees determine what portion of swap fees go to the protocol.

### Fee Protocol Values

| Value | Protocol Share | LP Share |
|-------|----------------|----------|
| 4 | 25% | 75% |
| 5 | 20% | 80% |
| 6 | 16.7% | 83.3% |
| 7 | 14.3% | 85.7% |
| 8 | 12.5% | 87.5% |
| 9 | 11.1% | 88.9% |
| 10 | 10% | 90% |
| 0 | 0% (disabled) | 100% |

### Set via Controller

```typescript
async function setProtocolFee(
    controller: Contract,
    poolAddress: string,
    feeProtocol: number
) {
    // Same fee for both tokens
    await controller.setFeeProtocol(poolAddress, feeProtocol, feeProtocol);
}

// Set 20% protocol fee
await setProtocolFee(controller, poolAddress, 5);
```

## Verifying Pool Creation

### Check Pool Exists

```typescript
async function verifyPool(
    factory: Contract,
    tokenA: string,
    tokenB: string,
    fee: number
) {
    const poolAddress = await factory.getPool(tokenA, tokenB, fee);

    if (poolAddress === ethers.constants.AddressZero) {
        console.log('Pool does not exist');
        return null;
    }

    const pool = await ethers.getContractAt('VinuSwapPool', poolAddress);
    const slot0 = await pool.slot0();

    console.log('Pool verified:');
    console.log('  Address:', poolAddress);
    console.log('  Current tick:', slot0.tick);
    console.log('  sqrtPriceX96:', slot0.sqrtPriceX96.toString());

    return pool;
}
```

### Full Verification Script

```typescript
async function verifyAllPools(factory: Contract, pools: Array<{
    tokenA: string,
    tokenB: string,
    fee: number,
    expectedPrice: number
}>) {
    for (const { tokenA, tokenB, fee, expectedPrice } of pools) {
        const poolAddress = await factory.getPool(tokenA, tokenB, fee);

        if (poolAddress === ethers.constants.AddressZero) {
            console.error(`Pool ${tokenA}/${tokenB}/${fee} not found!`);
            continue;
        }

        const pool = await ethers.getContractAt('VinuSwapPool', poolAddress);
        const [slot0, liquidity, token0, token1] = await Promise.all([
            pool.slot0(),
            pool.liquidity(),
            pool.token0(),
            pool.token1()
        ]);

        const actualPrice = decodePrice(slot0.sqrtPriceX96);
        const priceDiff = Math.abs(actualPrice - expectedPrice) / expectedPrice * 100;

        console.log(`\nPool: ${tokenA}/${tokenB}`);
        console.log(`  Address: ${poolAddress}`);
        console.log(`  Token0: ${token0}`);
        console.log(`  Token1: ${token1}`);
        console.log(`  Price: ${actualPrice.toFixed(4)} (expected: ${expectedPrice})`);
        console.log(`  Price diff: ${priceDiff.toFixed(2)}%`);
        console.log(`  Liquidity: ${liquidity.toString()}`);
        console.log(`  Status: ${slot0.unlocked ? 'Active' : 'Locked'}`);
    }
}
```

## Adding Initial Liquidity

After creating pools, add initial liquidity:

```typescript
async function addInitialLiquidity(
    positionManager: Contract,
    pool: {
        token0: string,
        token1: string,
        fee: number,
        amount0: BigNumber,
        amount1: BigNumber
    }
) {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Full range for initial liquidity
    const tickSpacing = fee === 100 ? 1 : fee === 500 ? 10 : fee === 3000 ? 60 : 200;
    const tickLower = Math.ceil(-887272 / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(887272 / tickSpacing) * tickSpacing;

    // Approve tokens
    const token0 = await ethers.getContractAt('IERC20', pool.token0);
    const token1 = await ethers.getContractAt('IERC20', pool.token1);

    await token0.approve(positionManager.address, pool.amount0);
    await token1.approve(positionManager.address, pool.amount1);

    // Mint position
    const tx = await positionManager.mint({
        token0: pool.token0,
        token1: pool.token1,
        fee: pool.fee,
        tickLower,
        tickUpper,
        amount0Desired: pool.amount0,
        amount1Desired: pool.amount1,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await positionManager.signer.getAddress(),
        deadline
    });

    const receipt = await tx.wait();
    console.log('Initial liquidity added');

    return receipt;
}
```

## Next Steps

- [Configuration](configuration.md) - Configure deployed contracts
- [SDK Examples](../sdk/examples.md) - Start using the SDK
