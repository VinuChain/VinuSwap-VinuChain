# Position Locking

VinuSwap extends the standard position manager with **position locking** - a feature that prevents liquidity removal until a specified timestamp.

## Overview

Position locking allows:
- **Locking liquidity** until a future timestamp
- **Demonstrating commitment** to liquidity provision
- **Creating vesting schedules** for LP tokens
- **Enabling trustless liquidity commitments**

## How It Works

Each position has a `lockedUntil` field:

```solidity
struct Position {
    // ... standard fields ...
    uint256 lockedUntil;  // Timestamp until position is locked
}
```

When `block.timestamp < lockedUntil`:
- ❌ `decreaseLiquidity()` - Blocked
- ❌ `burn()` - Blocked
- ✅ `collect()` - Allowed (fees can always be claimed)
- ✅ `increaseLiquidity()` - Allowed (can add more liquidity)

## Locking a Position

### Basic Lock

```javascript
async function lockPosition(tokenId, durationSeconds) {
    const lockUntil = Math.floor(Date.now() / 1000) + durationSeconds;
    const deadline = Math.floor(Date.now() / 1000) + 1800;

    const tx = await positionManager.lock(tokenId, lockUntil, deadline);
    return await tx.wait();
}

// Lock for 30 days
const thirtyDays = 30 * 24 * 60 * 60;
await lockPosition(tokenId, thirtyDays);
```

### Lock with Position Creation

```javascript
async function createAndLockPosition(
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    lockDuration
) {
    // Sort tokens
    if (token0.toLowerCase() > token1.toLowerCase()) {
        [token0, token1] = [token1, token0];
        [amount0, amount1] = [amount1, amount0];
    }

    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const lockUntil = Math.floor(Date.now() / 1000) + lockDuration;

    // Approve tokens
    await approveTokens(token0, token1, amount0, amount1);

    // Multicall: mint + lock
    const mintParams = {
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min: 0,
        amount1Min: 0,
        recipient: signer.address,
        deadline
    };

    // We need to mint first to get tokenId, then lock
    const mintTx = await positionManager.mint(mintParams);
    const mintReceipt = await mintTx.wait();

    const event = mintReceipt.events.find(e => e.event === 'IncreaseLiquidity');
    const tokenId = event.args.tokenId;

    // Lock the position
    await positionManager.lock(tokenId, lockUntil, deadline);

    return tokenId;
}

// Create position locked for 6 months
const sixMonths = 180 * 24 * 60 * 60;
await createAndLockPosition(
    USDT, WVC, 3000, tickLower, tickUpper,
    ethers.utils.parseUnits('1000', 6),
    ethers.utils.parseEther('0.5'),
    sixMonths
);
```

## Extending Locks

Locks can be extended but never shortened:

```javascript
async function extendLock(tokenId, newLockUntil) {
    // Get current lock
    const position = await getPositionWithLock(tokenId);

    if (newLockUntil <= position.lockedUntil) {
        throw new Error('New lock must be later than current lock');
    }

    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const tx = await positionManager.lock(tokenId, newLockUntil, deadline);
    return await tx.wait();
}
```

## Checking Lock Status

```javascript
async function isPositionLocked(tokenId) {
    const position = await positionManager.positions(tokenId);
    // Note: lockedUntil may need to be retrieved differently
    // depending on implementation
    return Date.now() / 1000 < position.lockedUntil;
}

async function getLockDetails(tokenId) {
    const position = await positionManager.positions(tokenId);

    const now = Math.floor(Date.now() / 1000);
    const lockedUntil = position.lockedUntil?.toNumber() || 0;

    return {
        lockedUntil,
        isLocked: now < lockedUntil,
        remainingSeconds: Math.max(0, lockedUntil - now),
        remainingDays: Math.max(0, (lockedUntil - now) / 86400)
    };
}
```

## Collecting Fees While Locked

Fees can always be collected, even from locked positions:

```javascript
async function collectFromLockedPosition(tokenId) {
    // This works even if position is locked
    const params = {
        tokenId,
        recipient: signer.address,
        amount0Max: ethers.constants.MaxUint128,
        amount1Max: ethers.constants.MaxUint128
    };

    const tx = await positionManager.collect(params);
    return await tx.wait();
}
```

## Adding Liquidity to Locked Positions

You can increase liquidity on locked positions:

```javascript
async function addToLockedPosition(tokenId, amount0, amount1) {
    // Get position details
    const position = await positionManager.positions(tokenId);

    // Approve additional tokens
    await approveToken(position.token0, amount0);
    await approveToken(position.token1, amount1);

    // Increase liquidity (works on locked positions)
    const params = {
        tokenId,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 1800
    };

    const tx = await positionManager.increaseLiquidity(params);
    return await tx.wait();
}
```

## Handling Locked Position Errors

```javascript
async function safeDecreaseLiquidity(tokenId, liquidity) {
    // Check lock status first
    const lockDetails = await getLockDetails(tokenId);

    if (lockDetails.isLocked) {
        throw new Error(
            `Position is locked for ${lockDetails.remainingDays.toFixed(1)} more days. ` +
            `Lock expires: ${new Date(lockDetails.lockedUntil * 1000).toISOString()}`
        );
    }

    return positionManager.decreaseLiquidity({
        tokenId,
        liquidity,
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 1800
    });
}
```

## Use Cases

### 1. Launch Liquidity Lock

Lock initial DEX liquidity to build trust:

```javascript
// Lock liquidity for 1 year after launch
const oneYear = 365 * 24 * 60 * 60;
await createAndLockPosition(
    PROJECT_TOKEN,
    WVC,
    10000,  // 1% fee for new token
    MIN_TICK,
    MAX_TICK,
    totalProjectTokenSupply.mul(20).div(100),  // 20% of supply
    launchVCAmount,
    oneYear
);
```

### 2. Team Token Vesting

Create locked positions for team allocations:

```javascript
async function createVestedPosition(recipient, vestingMonths) {
    const lockDuration = vestingMonths * 30 * 24 * 60 * 60;

    const params = {
        token0: STABLE_COIN,
        token1: PROJECT_TOKEN,
        fee: 3000,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: 0,
        amount1Desired: vestingAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient,  // Team member receives NFT
        deadline: Math.floor(Date.now() / 1000) + 1800
    };

    const { tokenId } = await createPosition(params);

    // Lock for vesting period
    const lockUntil = Math.floor(Date.now() / 1000) + lockDuration;
    await positionManager.lock(tokenId, lockUntil, params.deadline);

    return tokenId;
}
```

### 3. Partnership Commitments

Lock liquidity as part of partnership agreements:

```javascript
async function createPartnershipLock(
    partnerToken,
    ourToken,
    partnerAmount,
    ourAmount,
    commitmentMonths
) {
    const lockDuration = commitmentMonths * 30 * 24 * 60 * 60;

    const { tokenId } = await createPosition(
        partnerToken,
        ourToken,
        3000,
        calculateTicks(partnerToken, ourToken),
        partnerAmount,
        ourAmount
    );

    await lockPosition(tokenId, lockDuration);

    return {
        tokenId,
        lockedUntil: new Date(Date.now() + lockDuration * 1000)
    };
}
```

### 4. Progressive Unlock Schedule

Create multiple positions with staggered unlocks:

```javascript
async function createProgressiveUnlock(
    totalAmount,
    unlockSchedule  // Array of { percent, monthsFromNow }
) {
    const positions = [];

    for (const { percent, monthsFromNow } of unlockSchedule) {
        const amount = totalAmount.mul(percent).div(100);
        const lockDuration = monthsFromNow * 30 * 24 * 60 * 60;

        const { tokenId } = await createAndLockPosition(
            /* ... position params ... */,
            amount,
            lockDuration
        );

        positions.push({
            tokenId,
            amount,
            unlocksAt: new Date(Date.now() + lockDuration * 1000)
        });
    }

    return positions;
}

// Example: 25% every 3 months
await createProgressiveUnlock(totalAmount, [
    { percent: 25, monthsFromNow: 3 },
    { percent: 25, monthsFromNow: 6 },
    { percent: 25, monthsFromNow: 9 },
    { percent: 25, monthsFromNow: 12 }
]);
```

## Events

```solidity
event Lock(uint256 indexed tokenId, uint256 lockedUntil);
```

## Monitoring Locked Positions

```javascript
// Listen for lock events
positionManager.on('Lock', (tokenId, lockedUntil, event) => {
    console.log(`Position ${tokenId} locked until ${new Date(lockedUntil * 1000)}`);
});

// Query all positions for lock status
async function getLockedPositions(owner) {
    const balance = await positionManager.balanceOf(owner);
    const lockedPositions = [];

    for (let i = 0; i < balance; i++) {
        const tokenId = await positionManager.tokenOfOwnerByIndex(owner, i);
        const lockDetails = await getLockDetails(tokenId);

        if (lockDetails.isLocked) {
            lockedPositions.push({
                tokenId,
                ...lockDetails
            });
        }
    }

    return lockedPositions;
}
```

## Related

- [Providing Liquidity](providing-liquidity.md)
- [NonfungiblePositionManager Reference](../reference/periphery/position-manager.md)
