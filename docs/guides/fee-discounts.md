# Fee Discounts

VinuSwap includes a dynamic fee system that can provide discounts based on token holdings.

## Overview

The TieredDiscount fee manager reduces swap fees for users holding the protocol's token:

| Balance Threshold | Fee Discount |
|-------------------|--------------|
| ≥ 1,000,000 tokens | 4% off |
| ≥ 100,000 tokens | 3% off |
| ≥ 10,000 tokens | 2% off |
| ≥ 1,000 tokens | 1% off |
| < 1,000 tokens | No discount |

## How It Works

1. User initiates a swap
2. Pool calls `feeManager.computeFee(baseFee)`
3. TieredDiscount checks `tx.origin`'s token balance
4. Returns discounted fee based on tier
5. Swap executes with reduced fee

```
Base Fee: 0.30%
User Balance: 150,000 tokens (Tier 3)
Discount: 3%

Effective Fee = 0.30% × (1 - 0.03) = 0.291%
```

## Checking Your Discount

### Get Current Discount Tier

```javascript
async function getMyDiscount(discountContract, discountToken) {
    const myBalance = await discountToken.balanceOf(signer.address);

    // Get thresholds
    const thresholds = [];
    const discounts = [];

    for (let i = 0; i < 4; i++) {
        thresholds.push(await discountContract.thresholds(i));
        discounts.push(await discountContract.discounts(i));
    }

    // Find applicable tier
    let myDiscount = 0;
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (myBalance.gte(thresholds[i])) {
            myDiscount = discounts[i];
            break;
        }
    }

    return {
        balance: myBalance,
        discountBps: myDiscount,
        discountPercent: myDiscount / 100
    };
}

// Usage
const { discountPercent } = await getMyDiscount(tieredDiscount, discountToken);
console.log(`Your fee discount: ${discountPercent}%`);
```

### Calculate Effective Fee

```javascript
function calculateEffectiveFee(baseFee, discountBps) {
    // baseFee in hundredths of bips (3000 = 0.3%)
    // discountBps in basis points (300 = 3%)
    return baseFee * (10000 - discountBps) / 10000;
}

// Example
const baseFee = 3000;  // 0.3%
const discount = 300;   // 3%
const effectiveFee = calculateEffectiveFee(baseFee, discount);
// effectiveFee = 2910 (0.291%)
```

## Estimating Savings

### Per-Swap Savings

```javascript
async function estimateSwapSavings(
    tokenIn,
    tokenOut,
    poolFee,
    amountIn,
    discountBps
) {
    // Get quote at base fee (IQuoterV2 uses struct parameters)
    const [amountOut] = await quoter.callStatic.quoteExactInputSingle({
        tokenIn,
        tokenOut,
        amountIn,
        fee: poolFee,
        sqrtPriceLimitX96: 0
    });

    // Calculate fee amounts
    const baseFeeAmount = amountIn.mul(poolFee).div(1000000);
    const discountedFeeAmount = baseFeeAmount.mul(10000 - discountBps).div(10000);
    const savings = baseFeeAmount.sub(discountedFeeAmount);

    return {
        baseFee: baseFeeAmount,
        discountedFee: discountedFeeAmount,
        savings,
        savingsPercent: discountBps / 100
    };
}
```

### Annual Savings Projection

```javascript
function projectAnnualSavings(
    avgSwapSize,
    swapsPerMonth,
    baseFeePercent,
    discountPercent
) {
    const monthlyVolume = avgSwapSize * swapsPerMonth;
    const annualVolume = monthlyVolume * 12;

    const baseFees = annualVolume * (baseFeePercent / 100);
    const discountedFees = baseFees * (1 - discountPercent / 100);
    const annualSavings = baseFees - discountedFees;

    return {
        annualVolume,
        baseFees,
        discountedFees,
        annualSavings
    };
}

// Example: $10,000 swaps, 20x/month, 0.3% fee, 3% discount
const projection = projectAnnualSavings(10000, 20, 0.3, 3);
// annualSavings = $21.6 per year
```

## Acquiring Discount Tokens

### Buy on VinuSwap

```javascript
async function buyDiscountTokens(amountToBuy) {
    // Get quote (IQuoterV2 uses struct parameters)
    const [amountIn] = await quoter.callStatic.quoteExactOutputSingle({
        tokenIn: WVC,
        tokenOut: DISCOUNT_TOKEN,
        amount: amountToBuy,
        fee: 3000,
        sqrtPriceLimitX96: 0
    });

    // Execute swap
    await router.exactOutputSingle({
        tokenIn: WVC,
        tokenOut: DISCOUNT_TOKEN,
        fee: 3000,
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 1800,
        amountOut: amountToBuy,
        amountInMaximum: amountIn.mul(105).div(100),  // 5% slippage
        sqrtPriceLimitX96: 0
    });
}
```

### Calculate Breakeven

```javascript
function calculateBreakeven(
    tokenPrice,
    tokensNeeded,
    annualSavings
) {
    const investment = tokenPrice * tokensNeeded;
    const breakEvenMonths = investment / (annualSavings / 12);

    return {
        investment,
        annualSavings,
        breakEvenMonths,
        breakEvenYears: breakEvenMonths / 12
    };
}

// Example
const breakeven = calculateBreakeven(
    0.001,      // $0.001 per token
    100000,     // Need 100,000 for 3% discount
    21.6        // $21.6 annual savings
);
// investment: $100
// breakEvenYears: 4.6 years
```

## Pool-Specific Discounts

Some pools may have different discount configurations using OverridableFeeManager:

```javascript
async function getPoolFeeManager(pool, overridableFeeManager) {
    const override = await overridableFeeManager.feeManagerOverride(pool);

    if (override === ethers.constants.AddressZero) {
        return await overridableFeeManager.defaultFeeManager();
    }
    return override;
}

// Check if pool uses discounts
async function poolHasDiscounts(pool) {
    const feeManager = await getPoolFeeManager(pool, overridableFeeManager);

    // Check if it's the NoDiscount contract
    try {
        await new ethers.Contract(feeManager, tieredDiscountABI, provider)
            .discountToken();
        return true;  // Has discount token, so has discounts
    } catch {
        return false;  // NoDiscount or different implementation
    }
}
```

## Discount Tiers Visualization

```
         │                                        ████████
         │                                   ████████████████
Discount │                              █████████████████████████
   %     │                         ██████████████████████████████████
         │                    ███████████████████████████████████████████
         │               ████████████████████████████████████████████████████
    4%   │──────────────████████████████████████████████████████████████████──
    3%   │─────────█████████████████████████████████████████████████████████──
    2%   │────█████████████████████████████████████████████████████████████───
    1%   │████████████████████████████████████████████████████████████████────
    0%   │────────────────────────────────────────────────────────────────────
         └────────────────────────────────────────────────────────────────────
              1K      10K      100K     1M         Token Balance
```

## Best Practices

### 1. Check Before Trading

Always check your discount tier before large trades:

```javascript
async function swapWithDiscountInfo(tokenIn, tokenOut, fee, amountIn) {
    // Get discount info
    const { discountPercent } = await getMyDiscount(tieredDiscount, discountToken);

    console.log(`Your discount: ${discountPercent}%`);

    // Calculate effective fee
    const effectiveFee = fee * (100 - discountPercent) / 100;
    console.log(`Effective fee: ${effectiveFee / 10000}%`);

    // Proceed with swap
    // ...
}
```

### 2. Consider Token Purchase

For frequent traders, buying discount tokens may be worthwhile:

```javascript
async function shouldBuyDiscountTokens(monthlyVolume, baseFee) {
    const tiers = [
        { tokens: 1000000, discount: 4 },
        { tokens: 100000, discount: 3 },
        { tokens: 10000, discount: 2 },
        { tokens: 1000, discount: 1 }
    ];

    const tokenPrice = await getTokenPrice(DISCOUNT_TOKEN);

    for (const tier of tiers) {
        const cost = tier.tokens * tokenPrice;
        const annualSavings = monthlyVolume * 12 * (baseFee / 100) * (tier.discount / 100);
        const roiYears = cost / annualSavings;

        console.log(`
            Tier: ${tier.discount}% discount
            Cost: $${cost}
            Annual Savings: $${annualSavings}
            ROI: ${roiYears.toFixed(1)} years
        `);
    }
}
```

### 3. Maintain Balance

Remember that discounts are checked at swap time:

```javascript
// Warning system for low balance
async function checkDiscountStatus() {
    const balance = await discountToken.balanceOf(signer.address);
    const { discountBps } = await getMyDiscount(tieredDiscount, discountToken);

    // Check if close to dropping a tier
    const thresholds = [1000, 10000, 100000, 1000000].map(
        t => ethers.utils.parseEther(t.toString())
    );

    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (balance.gte(thresholds[i])) {
            const buffer = balance.sub(thresholds[i]);
            const bufferPercent = buffer.mul(100).div(thresholds[i]);

            if (bufferPercent.lt(10)) {
                console.warn(
                    `Warning: You're within 10% of dropping to a lower discount tier!`
                );
            }
            break;
        }
    }
}
```

## Related

- [TieredDiscount Reference](../reference/fees/tiered-discount.md)
- [Fee Management Overview](../reference/fees/overview.md)
- [Executing Swaps](swapping.md)
