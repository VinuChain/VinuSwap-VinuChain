# VinuSwap Class

The main class for interacting with VinuSwap contracts.

## Constructor

The VinuSwap class uses a factory pattern:

```typescript
static async create(
    tokenA: string,
    tokenB: string,
    poolAddress: string,
    quoterAddress: string,
    routerAddress: string,
    positionManagerAddress: string,
    signerOrProvider: Signer | Provider
): Promise<VinuSwap>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokenA` | `string` | First token address |
| `tokenB` | `string` | Second token address |
| `poolAddress` | `string` | Pool contract address |
| `quoterAddress` | `string` | Quoter contract address |
| `routerAddress` | `string` | SwapRouter address |
| `positionManagerAddress` | `string` | Position manager address |
| `signerOrProvider` | `Signer \| Provider` | ethers signer or provider |

### Example

```typescript
const sdk = await VinuSwap.create(
    USDC_ADDRESS,
    WETH_ADDRESS,
    poolAddress,
    quoterAddress,
    routerAddress,
    positionManagerAddress,
    provider
);
```

## Properties

### Contract References

```typescript
pool: ethers.Contract           // VinuSwapPool
quoter: ethers.Contract         // VinuSwapQuoter
router: ethers.Contract         // SwapRouter
positionManager: ethers.Contract // NonfungiblePositionManager
```

### Token Information

```typescript
token0: string                  // Token0 address (sorted)
token1: string                  // Token1 address (sorted)
token0Contract: ethers.Contract // Token0 ERC20
token1Contract: ethers.Contract // Token1 ERC20
```

### Connection

```typescript
signer: Signer | null           // Connected signer
provider: Provider              // ethers provider
```

## Methods

### connect

Connects a signer for transaction signing.

```typescript
connect(signer: Signer): VinuSwap
```

Returns a new VinuSwap instance with the signer attached.

```typescript
const connected = sdk.connect(signer);
```

### getPoolState

Gets current pool state.

```typescript
async getPoolState(): Promise<{
    sqrtPriceX96: BigNumber;
    tick: number;
    liquidity: BigNumber;
    fee: number;
}>
```

### getQuote

Gets a quote for a swap.

```typescript
async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber
): Promise<{
    amountOut: BigNumber;
    sqrtPriceX96After: BigNumber;
    ticksCrossed: number;
    gasEstimate: BigNumber;
}>
```

### swap

Executes a swap (requires signer).

```typescript
async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOutMinimum: BigNumber,
    deadline: number,
    recipient?: string
): Promise<{
    hash: string;
    amountOut: BigNumber;
}>
```

### mint

Creates a new liquidity position (requires signer).

```typescript
async mint(
    tickLower: number,
    tickUpper: number,
    amount0Desired: BigNumber,
    amount1Desired: BigNumber,
    amount0Min: BigNumber,
    amount1Min: BigNumber,
    deadline: number
): Promise<{
    tokenId: BigNumber;
    liquidity: BigNumber;
    amount0: BigNumber;
    amount1: BigNumber;
}>
```

### increaseLiquidity

Adds liquidity to existing position.

```typescript
async increaseLiquidity(
    tokenId: BigNumber,
    amount0Desired: BigNumber,
    amount1Desired: BigNumber,
    amount0Min: BigNumber,
    amount1Min: BigNumber,
    deadline: number
): Promise<{
    liquidity: BigNumber;
    amount0: BigNumber;
    amount1: BigNumber;
}>
```

### decreaseLiquidity

Removes liquidity from position.

```typescript
async decreaseLiquidity(
    tokenId: BigNumber,
    liquidity: BigNumber,
    amount0Min: BigNumber,
    amount1Min: BigNumber,
    deadline: number
): Promise<{
    amount0: BigNumber;
    amount1: BigNumber;
}>
```

### collect

Collects tokens owed from position.

```typescript
async collect(
    tokenId: BigNumber,
    recipient: string,
    amount0Max: BigNumber,
    amount1Max: BigNumber
): Promise<{
    amount0: BigNumber;
    amount1: BigNumber;
}>
```

## Usage Examples

### Complete Swap Flow

```typescript
// 1. Create SDK
const sdk = await VinuSwap.create(...);

// 2. Connect signer
const connected = sdk.connect(signer);

// 3. Get quote
const quote = await connected.getQuote(
    WETH,
    USDC,
    ethers.utils.parseEther('1')
);

console.log('Expected output:', quote.amountOut.toString());

// 4. Calculate slippage
const slippage = 50; // 0.5%
const minOut = quote.amountOut.mul(10000 - slippage).div(10000);

// 5. Execute swap
const result = await connected.swap(
    WETH,
    USDC,
    ethers.utils.parseEther('1'),
    minOut,
    Math.floor(Date.now() / 1000) + 1800
);

console.log('Swap hash:', result.hash);
```

### Complete Liquidity Flow

```typescript
// 1. Setup
const sdk = await VinuSwap.create(...);
const connected = sdk.connect(signer);

// 2. Approve tokens
await connected.token0Contract.approve(
    connected.positionManager.address,
    amount0
);
await connected.token1Contract.approve(
    connected.positionManager.address,
    amount1
);

// 3. Mint position
const deadline = Math.floor(Date.now() / 1000) + 1800;
const { tokenId, liquidity } = await connected.mint(
    -60000,  // tickLower
    60000,   // tickUpper
    amount0,
    amount1,
    0,       // amount0Min
    0,       // amount1Min
    deadline
);

console.log('Position created:', tokenId.toString());

// 4. Later: collect fees
const fees = await connected.collect(
    tokenId,
    await signer.getAddress(),
    ethers.constants.MaxUint128,
    ethers.constants.MaxUint128
);

console.log('Collected:', fees.amount0.toString(), fees.amount1.toString());
```

## Error Handling

```typescript
try {
    const result = await connected.swap(...);
} catch (error) {
    if (error.message.includes('STF')) {
        console.error('Insufficient balance or allowance');
    } else if (error.message.includes('Too little received')) {
        console.error('Slippage exceeded');
    } else if (error.message.includes('Transaction too old')) {
        console.error('Deadline passed');
    } else {
        console.error('Unknown error:', error);
    }
}
```

## Type Definitions

```typescript
interface PoolState {
    sqrtPriceX96: BigNumber;
    tick: number;
    liquidity: BigNumber;
    fee: number;
}

interface QuoteResult {
    amountOut: BigNumber;
    sqrtPriceX96After: BigNumber;
    ticksCrossed: number;
    gasEstimate: BigNumber;
}

interface SwapResult {
    hash: string;
    amountOut: BigNumber;
}

interface MintResult {
    tokenId: BigNumber;
    liquidity: BigNumber;
    amount0: BigNumber;
    amount1: BigNumber;
}
```
