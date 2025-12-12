# Frequently Asked Questions

Common questions about VinuSwap development and integration.

## General

### What is VinuSwap?

VinuSwap is a decentralized exchange (DEX) built on VinuChain, based on the Uniswap V3 concentrated liquidity AMM. It enables efficient token swaps and liquidity provision with customizable fee management.

### How does VinuSwap differ from Uniswap V3?

VinuSwap extends Uniswap V3 with:

| Feature | Uniswap V3 | VinuSwap |
|---------|------------|----------|
| Fee Manager | None | Per-pool fee managers |
| Fee Discounts | None | Balance-based tiered discounts |
| Position Locking | None | Lock positions until specified time |
| Fee Distribution | Single recipient | Multi-account via Controller |
| Network | Ethereum/L2s | VinuChain |

### What fee tiers are available?

VinuSwap supports standard fee tiers:

| Fee | Tick Spacing | Use Case |
|-----|--------------|----------|
| 500 (0.05%) | 10 | Stable pairs |
| 3000 (0.30%) | 60 | Standard pairs |
| 10000 (1.00%) | 200 | Exotic pairs |

## Swapping

### Why did my swap fail?

Common reasons:

1. **Insufficient allowance** - Approve tokens first
2. **Slippage exceeded** - Increase `amountOutMinimum`
3. **Deadline passed** - Transaction took too long
4. **Insufficient liquidity** - Pool may lack depth
5. **Price moved** - Price changed beyond limit

### How do I calculate slippage?

```javascript
// Get quote
const quote = await quoter.quoteExactInputSingle({
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    sqrtPriceLimitX96: 0
});

// Apply slippage (e.g., 0.5%)
const slippagePercent = 0.5;
const minOut = quote.amountOut.mul(1000 - slippagePercent * 10).div(1000);
```

### What is `sqrtPriceLimitX96`?

A price limit for swaps in Q64.96 format. Set to `0` for no limit, or calculate:

```javascript
// For zeroForOne (token0 → token1), price decreases
// Set minimum acceptable price
const limit = currentSqrtPrice.mul(995).div(1000); // ~0.5% below current

// For !zeroForOne (token1 → token0), price increases
// Set maximum acceptable price
const limit = currentSqrtPrice.mul(1005).div(1000); // ~0.5% above current
```

### How do multi-hop swaps work?

The path encodes token addresses and fees:

```javascript
// WETH → USDC → DAI
const path = encodePath(
    [WETH, USDC, DAI],
    [3000, 500]  // 0.3% then 0.05%
);

await router.exactInput({
    path,
    recipient: userAddress,
    deadline,
    amountIn,
    amountOutMinimum
});
```

## Liquidity

### How do I choose a price range?

Consider:

1. **Tight range** - Higher capital efficiency, more active management
2. **Wide range** - Lower efficiency, less maintenance
3. **Around current price** - Earns fees, both tokens deployed
4. **Above current price** - Single-sided (token1), bet on price increase
5. **Below current price** - Single-sided (token0), bet on price decrease

### Why is my position out of range?

Price moved outside your tick range. You're earning no fees and holding only one token. Options:

1. Wait for price to return
2. Close position and open new one at current price
3. Add adjacent position to cover current price

### How do I calculate my position's value?

```javascript
const position = await positionManager.positions(tokenId);
const { amount0, amount1 } = await positionManager.callStatic.collect({
    tokenId,
    recipient: address,
    amount0Max: MAX_UINT128,
    amount1Max: MAX_UINT128
});

// Uncollected fees + position value
const { amount0: principal0, amount1: principal1 } = getAmountsForLiquidity(
    sqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    position.liquidity
);
```

### Can I add liquidity to an existing position?

Yes, use `increaseLiquidity`:

```javascript
await positionManager.increaseLiquidity({
    tokenId,
    amount0Desired,
    amount1Desired,
    amount0Min,
    amount1Min,
    deadline
});
```

### What happens when I burn a position?

1. Liquidity is removed from the pool
2. Tokens become claimable via `collect()`
3. Position NFT remains until all tokens collected
4. NFT is burned when liquidity and owed tokens are zero

## Fees

### How do fee discounts work?

VinuSwap's TieredDiscount contract reduces fees based on token holdings:

```
Balance ≥ 1,000,000 → 50% discount
Balance ≥ 500,000  → 30% discount
Balance ≥ 100,000  → 10% discount
Balance < 100,000  → No discount
```

### How do I check my fee discount?

```javascript
const tieredDiscount = new ethers.Contract(TIERED_DISCOUNT, abi, provider);
const effectiveFee = await tieredDiscount.computeFee(baseFee);
// If baseFee is 3000 and you have 50% discount, effectiveFee is 1500
```

### Where do protocol fees go?

Fees flow to the Controller contract, which can split to multiple recipients:

```javascript
const controller = await pool.feeReceiver();
// Controller distributes to configured accounts
```

## Positions

### How do I lock a position?

```javascript
const unlockTime = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
await positionManager.lock(tokenId, unlockTime);
```

### Can I unlock early?

No, locked positions cannot be unlocked before the specified time. This is by design for vesting or commitment purposes.

### Can I still collect fees from locked positions?

Yes, fee collection is always available:

```javascript
// Works even when position is locked
await positionManager.collect({
    tokenId,
    recipient,
    amount0Max: MAX_UINT128,
    amount1Max: MAX_UINT128
});
```

## Oracle

### How do I get a TWAP price?

```javascript
const secondsAgo = 1800; // 30 minutes
const [tickCumulatives] = await pool.observe([secondsAgo, 0]);
const twapTick = (tickCumulatives[1] - tickCumulatives[0]) / secondsAgo;
const twapPrice = Math.pow(1.0001, twapTick);
```

### What is observation cardinality?

The number of price observations stored. Default is 1 (current only). Increase for longer TWAP periods:

```javascript
// For 24-hour TWAP with ~12s blocks
const needed = Math.ceil((24 * 3600) / 12); // 7200
await pool.increaseObservationCardinalityNext(needed);
```

### Why is my TWAP query reverting?

- Cardinality may be too low
- Pool may not have enough history
- Check with `getOldestObservationSecondsAgo()`

## Development

### How do I run a local development environment?

```bash
# Clone and install
git clone https://github.com/vinuswap/vinuswap-contracts
cd vinuswap-contracts
npm install

# Compile
npx hardhat compile

# Deploy locally
npx hardhat run scripts/deploy.js --network localhost
```

### How do I get the pool init code hash?

```javascript
const poolInitHelper = await ethers.getContractAt(
    'PoolInitHelper',
    POOL_INIT_HELPER_ADDRESS
);
const hash = await poolInitHelper.POOL_INIT_CODE_HASH();
```

### How do I verify contracts?

```bash
npx hardhat verify --network vinuchain CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

## Troubleshooting

### "LOK" error

The pool is locked (reentrancy guard). This shouldn't happen in normal usage. Check if you're calling pool functions from within a callback.

### "SPL" error

`sqrtPriceLimitX96` is invalid. Ensure it's within the valid range for your swap direction.

### "TLU" / "TLM" errors

Tick out of bounds. Check your tick values are within MIN_TICK and MAX_TICK.

### "AS" error

`amountSpecified` cannot be zero. Provide a non-zero swap amount.

### "IIA" error

Insufficient input amount. The calculated input exceeds `amountInMaximum`.

### Transaction stuck pending

- Check gas price is sufficient
- Verify nonce is correct
- Consider speeding up or canceling

## Related

- [Security](security.md)
- [Concepts](../overview/concepts.md)
- [Guides](../guides/local-environment.md)
