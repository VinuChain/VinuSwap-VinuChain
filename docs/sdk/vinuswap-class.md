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
    USDT_ADDRESS,
    WVC_ADDRESS,
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
pool: VinuSwapPool              // VinuSwapPool contract
quoter: VinuSwapQuoter          // VinuSwapQuoter contract
router: SwapRouter              // SwapRouter contract
positionManager: NonfungiblePositionManager // Position manager contract
token0Contract: ethers.Contract // Token0 ERC20 contract
token1Contract: ethers.Contract // Token1 ERC20 contract
signerOrProvider: Signer | Provider // Connected signer or provider
```

### Token Addresses (Getters)

```typescript
get token0Address(): string     // Token0 address (sorted)
get token1Address(): string     // Token1 address (sorted)
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

---

## Pool Query Methods

### price

Gets the current price ratio (token1/token0).

```typescript
async price(): Promise<string>
```

### poolFee

Gets the pool fee in bips (0.01%).

```typescript
async poolFee(): Promise<number>
```

### locked

Checks if the pool is locked.

```typescript
async locked(): Promise<boolean>
```

### factory

Gets the factory address that created the pool.

```typescript
async factory(): Promise<string>
```

### balance0 / balance1

Gets the token balances of the pool.

```typescript
async balance0(): Promise<BigNumber>
async balance1(): Promise<BigNumber>
```

### protocolShare0 / protocolShare1

Gets the protocol fee share for each token.

```typescript
async protocolShare0(): Promise<number>
async protocolShare1(): Promise<number>
```

### availableProtocolFees

Gets collected protocol fees.

```typescript
async availableProtocolFees(): Promise<[BigNumber, BigNumber]>
```

---

## Swap Methods

### quoteExactInput

Gets a quote for swapping an exact input amount.

```typescript
async quoteExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumberish
): Promise<string>
```

Returns the expected output amount as a string.

**Example:**

```typescript
const amountOut = await sdk.quoteExactInput(
    WVC_ADDRESS,
    USDT_ADDRESS,
    ethers.utils.parseEther('1')
);
console.log('Expected output:', amountOut);
```

### swapExactInput

Swaps an exact input amount for a minimum output (requires signer).

```typescript
async swapExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumberish,
    amountOutMinimum: BigNumberish,
    recipient: string,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

**Example:**

```typescript
const tx = await connected.swapExactInput(
    WVC_ADDRESS,
    USDT_ADDRESS,
    ethers.utils.parseEther('1'),
    minAmountOut,
    recipientAddress,
    new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
);
await tx.wait();
```

### quoteExactOutput

Gets a quote for the input needed to receive an exact output.

```typescript
async quoteExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: BigNumberish
): Promise<string>
```

Returns the required input amount as a string.

### swapExactOutput

Swaps up to a maximum input for an exact output amount (requires signer).

```typescript
async swapExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: string,
    amountInMaximum: string,
    recipient: string,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

---

## Position Methods

### positionIdsByOwner

Gets all position NFT IDs owned by an address.

```typescript
async positionIdsByOwner(owner: string): Promise<BigNumber[]>
```

### positionOwner

Gets the owner of a position.

```typescript
async positionOwner(nftId: BigNumberish): Promise<string>
```

### positionOperator

Gets the approved operator for a position.

```typescript
async positionOperator(nftId: BigNumberish): Promise<string>
```

### positionLiquidity

Gets the liquidity of a position.

```typescript
async positionLiquidity(nftId: BigNumberish): Promise<BigNumber>
```

### positionAmount0 / positionAmount1

Gets the token amounts in a position.

```typescript
async positionAmount0(nftId: BigNumberish): Promise<BigNumber>
async positionAmount1(nftId: BigNumberish): Promise<BigNumber>
```

### positionPriceBounds

Gets the price range bounds of a position.

```typescript
async positionPriceBounds(nftId: BigNumberish): Promise<[string, string]>
```

Returns `[lowerPriceBound, upperPriceBound]` as strings.

### positionTokensOwed

Gets uncollected tokens owed to a position.

```typescript
async positionTokensOwed(nftId: BigNumberish): Promise<[BigNumber, BigNumber]>
```

### positionLockedUntil

Gets the lock expiration date (or null if never locked).

```typescript
async positionLockedUntil(nftId: BigNumberish): Promise<Date | null>
```

### positionIsLocked

Checks if a position is currently locked.

```typescript
async positionIsLocked(nftId: BigNumberish): Promise<boolean>
```

### positionTokenURI

Gets the token URI for a position NFT.

```typescript
async positionTokenURI(nftId: BigNumberish): Promise<string>
```

---

## Liquidity Methods

### mint

Creates a new liquidity position using price ratios (requires signer).

```typescript
async mint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish,
    slippageRatio: number,
    recipient: string,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ratioLower` | `number` | Lower price ratio (token1/token0) |
| `ratioUpper` | `number` | Upper price ratio (token1/token0) |
| `amount0Desired` | `BigNumberish` | Desired token0 amount |
| `amount1Desired` | `BigNumberish` | Desired token1 amount |
| `slippageRatio` | `number` | Slippage tolerance (0-1, e.g., 0.005 for 0.5%) |
| `recipient` | `string` | NFT recipient address |
| `deadline` | `Date` | Transaction deadline |

**Example:**

```typescript
// Create position with price range 1800-2200
const tx = await connected.mint(
    1800,  // lower price ratio
    2200,  // upper price ratio
    ethers.utils.parseUnits('1000', 6),  // 1000 USDT
    ethers.utils.parseEther('0.5'),       // 0.5 WVC
    0.005,  // 0.5% slippage
    recipientAddress,
    new Date(Date.now() + 30 * 60 * 1000)
);
```

### quoteMint

Quotes the amounts that will be used when minting.

```typescript
async quoteMint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish
): Promise<[BigNumber, BigNumber]>
```

### increaseLiquidity

Adds liquidity to an existing position (requires signer).

```typescript
async increaseLiquidity(
    nftId: BigNumberish,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish,
    amount0Min: BigNumberish,
    amount1Min: BigNumberish,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

### quoteIncreaseLiquidity

Quotes the amounts that will be added.

```typescript
async quoteIncreaseLiquidity(
    nftId: BigNumberish,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish
): Promise<[BigNumber, BigNumber]>
```

### decreaseLiquidity

Removes liquidity from a position (requires signer).

```typescript
async decreaseLiquidity(
    nftId: BigNumberish,
    liquidity: BigNumberish,
    amount0Min: BigNumberish,
    amount1Min: BigNumberish,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

**Note:** Tokens are not transferred directly. Call `collect()` to receive them.

### quoteDecreaseLiquidity

Quotes the amounts that will be removed.

```typescript
async quoteDecreaseLiquidity(
    nftId: BigNumberish,
    liquidity: BigNumberish
): Promise<[BigNumber, BigNumber]>
```

### collect

Collects tokens owed from a position (requires signer).

```typescript
async collect(
    nftId: BigNumberish,
    recipient: string,
    amount0Max: BigNumberish,
    amount1Max: BigNumberish
): Promise<ethers.ContractTransaction>
```

### burn

Burns a position NFT (requires signer).

```typescript
async burn(nftId: BigNumberish): Promise<ethers.Transaction>
```

**Note:** Position must have zero liquidity and zero tokens owed.

### lock

Locks a position until a specified date (requires signer).

```typescript
async lock(
    nftId: BigNumberish,
    lockedUntil: Date,
    deadline: Date
): Promise<ethers.ContractTransaction>
```

---

## Protocol Methods

### collectProtocol

Collects protocol fees (requires appropriate permissions).

```typescript
async collectProtocol(
    recipient: string,
    amount0Requested: BigNumberish,
    amount1Requested: BigNumberish
): Promise<ethers.ContractTransaction>
```

---

## Usage Examples

### Complete Swap Flow

```typescript
// 1. Create SDK
const sdk = await VinuSwap.create(
    WVC_ADDRESS,
    USDT_ADDRESS,
    poolAddress,
    quoterAddress,
    routerAddress,
    positionManagerAddress,
    provider
);

// 2. Connect signer
const connected = sdk.connect(signer);

// 3. Get quote
const expectedOutput = await connected.quoteExactInput(
    WVC_ADDRESS,
    USDT_ADDRESS,
    ethers.utils.parseEther('1')
);

console.log('Expected output:', expectedOutput);

// 4. Calculate slippage (0.5%)
const minOut = BigNumber.from(expectedOutput).mul(9950).div(10000);

// 5. Execute swap
const deadline = new Date(Date.now() + 30 * 60 * 1000);
const tx = await connected.swapExactInput(
    WVC_ADDRESS,
    USDT_ADDRESS,
    ethers.utils.parseEther('1'),
    minOut,
    await signer.getAddress(),
    deadline
);

const receipt = await tx.wait();
console.log('Swap completed:', receipt.transactionHash);
```

### Complete Liquidity Flow

```typescript
// 1. Setup
const sdk = await VinuSwap.create(...);
const connected = sdk.connect(signer);

// 2. Approve tokens
const amount0 = ethers.utils.parseUnits('1000', 6);
const amount1 = ethers.utils.parseEther('0.5');

await connected.token0Contract.approve(
    connected.positionManager.address,
    amount0
);
await connected.token1Contract.approve(
    connected.positionManager.address,
    amount1
);

// 3. Mint position with price range
const deadline = new Date(Date.now() + 30 * 60 * 1000);
const tx = await connected.mint(
    1800,   // lower price ratio
    2200,   // upper price ratio
    amount0,
    amount1,
    0.005,  // 0.5% slippage
    await signer.getAddress(),
    deadline
);

const receipt = await tx.wait();
console.log('Position created:', receipt.transactionHash);

// 4. Get position IDs
const positions = await connected.positionIdsByOwner(await signer.getAddress());
const tokenId = positions[positions.length - 1];

// 5. Check position details
const liquidity = await connected.positionLiquidity(tokenId);
const [amount0InPosition, amount1InPosition] = await Promise.all([
    connected.positionAmount0(tokenId),
    connected.positionAmount1(tokenId)
]);

console.log('Liquidity:', liquidity.toString());
console.log('Token0 in position:', amount0InPosition.toString());
console.log('Token1 in position:', amount1InPosition.toString());

// 6. Later: collect fees
const collectTx = await connected.collect(
    tokenId,
    await signer.getAddress(),
    ethers.constants.MaxUint128,
    ethers.constants.MaxUint128
);
await collectTx.wait();
```

### Position Locking

```typescript
// Lock position for 30 days
const lockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const deadline = new Date(Date.now() + 30 * 60 * 1000);

const tx = await connected.lock(tokenId, lockedUntil, deadline);
await tx.wait();

// Check lock status
const isLocked = await connected.positionIsLocked(tokenId);
const lockExpiry = await connected.positionLockedUntil(tokenId);

console.log('Is locked:', isLocked);
console.log('Lock expires:', lockExpiry?.toISOString());
```

## Error Handling

```typescript
try {
    const tx = await connected.swapExactInput(...);
    await tx.wait();
} catch (error) {
    if (error.message.includes('STF')) {
        console.error('Insufficient balance or allowance');
    } else if (error.message.includes('Too little received')) {
        console.error('Slippage exceeded');
    } else if (error.message.includes('Transaction too old')) {
        console.error('Deadline passed');
    } else if (error.message.includes('TokenIn address does not match')) {
        console.error('Invalid token address for this pool');
    } else {
        console.error('Unknown error:', error);
    }
}
```
