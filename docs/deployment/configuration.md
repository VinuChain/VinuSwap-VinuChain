# Configuration

Post-deployment configuration for VinuSwap contracts.

## Controller Configuration

### Fee Distribution Setup

```typescript
async function setupFeeDistribution(controller: Contract) {
    const accounts = [
        '0x...', // Treasury (40%)
        '0x...', // Development (30%)
        '0x...', // Buyback & burn (20%)
        '0x...'  // Community rewards (10%)
    ];
    const shares = [4, 3, 2, 1];

    // If Controller was deployed with different accounts, update
    // Note: This requires owner access

    console.log('Fee distribution:');
    for (let i = 0; i < accounts.length; i++) {
        const percentage = (shares[i] / shares.reduce((a, b) => a + b, 0)) * 100;
        console.log(`  ${accounts[i]}: ${percentage}%`);
    }
}
```

### Managing Accounts

```typescript
// Add new account
async function addFeeAccount(
    controller: Contract,
    account: string,
    share: number
) {
    await controller.addAccount(account, share);
    console.log(`Added ${account} with share ${share}`);
}

// Update share
async function updateShare(
    controller: Contract,
    account: string,
    newShare: number
) {
    await controller.updateShare(account, newShare);
    console.log(`Updated ${account} to share ${newShare}`);
}

// Remove account (must withdraw first)
async function removeFeeAccount(
    controller: Contract,
    account: string
) {
    await controller.removeAccount(account);
    console.log(`Removed ${account}`);
}
```

## Fee Manager Configuration

### TieredDiscount Settings

```typescript
async function configureTieredDiscount(tieredDiscount: Contract) {
    // Update thresholds
    const newThresholds = [
        ethers.utils.parseEther('500'),     // Lower entry
        ethers.utils.parseEther('5000'),
        ethers.utils.parseEther('50000'),
        ethers.utils.parseEther('500000')
    ];

    await tieredDiscount.setThresholds(newThresholds);

    // Update discount rates
    const newDiscounts = [150, 300, 450, 600]; // 1.5%, 3%, 4.5%, 6%
    await tieredDiscount.setDiscounts(newDiscounts);

    console.log('TieredDiscount configured');
}
```

### OverridableFeeManager Settings

```typescript
async function configureOverridableFeeManager(
    overridable: Contract,
    pools: Array<{ pool: string, feeManager: string }>
) {
    for (const { pool, feeManager } of pools) {
        await overridable.setOverride(pool, feeManager);
        console.log(`Pool ${pool} using ${feeManager}`);
    }
}
```

## Pool Configuration

### Protocol Fee Settings

```typescript
async function configureProtocolFees(
    controller: Contract,
    pools: string[],
    feeProtocol: number
) {
    for (const pool of pools) {
        await controller.setFeeProtocol(pool, feeProtocol, feeProtocol);
        console.log(`Pool ${pool}: protocol fee set to 1/${feeProtocol}`);
    }
}
```

### Batch Configuration

```typescript
async function batchConfigurePools(
    controller: Contract,
    poolConfigs: Array<{
        address: string,
        feeProtocol: number
    }>
) {
    for (const config of poolConfigs) {
        await controller.setFeeProtocol(
            config.address,
            config.feeProtocol,
            config.feeProtocol
        );
    }
}

// Example
await batchConfigurePools(controller, [
    { address: '0x...', feeProtocol: 5 },  // 20%
    { address: '0x...', feeProtocol: 4 },  // 25%
    { address: '0x...', feeProtocol: 10 }, // 10%
]);
```

## Oracle Configuration

### Increase Oracle Cardinality

For longer TWAP periods, increase observation capacity:

```typescript
async function increaseOracleCapacity(
    pool: Contract,
    newCardinality: number
) {
    // Current cardinality
    const slot0 = await pool.slot0();
    console.log('Current cardinality:', slot0.observationCardinality);

    // Increase (one-time gas cost)
    await pool.increaseObservationCardinalityNext(newCardinality);
    console.log(`Cardinality increased to ${newCardinality}`);
}

// Increase to support 24-hour TWAP (assuming ~12 sec blocks)
// 24 hours = 7200 observations
await increaseOracleCapacity(pool, 7200);
```

## Ownership Management

### Transfer Ownership

```typescript
// Transfer Factory ownership
async function transferFactoryOwnership(
    factory: Contract,
    newOwner: string
) {
    await factory.setOwner(newOwner);
    console.log(`Factory ownership transferred to ${newOwner}`);
}

// Transfer TieredDiscount ownership
async function transferFeeManagerOwnership(
    tieredDiscount: Contract,
    newOwner: string
) {
    await tieredDiscount.transferOwnership(newOwner);
    console.log(`TieredDiscount ownership transferred to ${newOwner}`);
}
```

### Multi-Sig Setup

For production, consider transferring ownership to a multi-sig:

```typescript
async function setupMultisig(contracts: {
    factory?: Contract,
    controller?: Contract,
    tieredDiscount?: Contract
}, multisigAddress: string) {
    if (contracts.factory) {
        await contracts.factory.setOwner(multisigAddress);
    }
    if (contracts.controller) {
        await contracts.controller.transferOwnership(multisigAddress);
    }
    if (contracts.tieredDiscount) {
        await contracts.tieredDiscount.transferOwnership(multisigAddress);
    }

    console.log(`Ownership transferred to multisig: ${multisigAddress}`);
}
```

## Configuration Verification

### Verify All Settings

```typescript
async function verifyConfiguration(addresses: {
    factory: string,
    controller: string,
    tieredDiscount: string,
    pools: string[]
}) {
    const factory = await ethers.getContractAt('VinuSwapFactory', addresses.factory);
    const controller = await ethers.getContractAt('Controller', addresses.controller);
    const tieredDiscount = await ethers.getContractAt('TieredDiscount', addresses.tieredDiscount);

    console.log('=== Configuration Verification ===\n');

    // Factory
    console.log('Factory:');
    console.log('  Owner:', await factory.owner());

    // Controller
    console.log('\nController:');
    console.log('  Factory:', await controller.factory());

    // TieredDiscount
    console.log('\nTieredDiscount:');
    console.log('  Discount Token:', await tieredDiscount.discountToken());
    for (let i = 0; i < 4; i++) {
        const threshold = await tieredDiscount.thresholds(i);
        const discount = await tieredDiscount.discounts(i);
        console.log(`  Tier ${i + 1}: ${ethers.utils.formatEther(threshold)} tokens → ${discount / 100}%`);
    }

    // Pools
    console.log('\nPools:');
    for (const poolAddress of addresses.pools) {
        const pool = await ethers.getContractAt('VinuSwapPool', poolAddress);
        const [token0, token1, fee, slot0] = await Promise.all([
            pool.token0(),
            pool.token1(),
            pool.fee(),
            pool.slot0()
        ]);

        console.log(`\n  Pool: ${poolAddress}`);
        console.log(`    Token0: ${token0}`);
        console.log(`    Token1: ${token1}`);
        console.log(`    Fee: ${fee}`);
        console.log(`    Protocol fee: 1/${slot0.feeProtocol & 0xf} and 1/${slot0.feeProtocol >> 4}`);
    }
}
```

## Configuration Checklist

### Pre-Launch

- [ ] Factory ownership transferred to Controller
- [ ] Controller accounts and shares configured
- [ ] TieredDiscount thresholds set appropriately
- [ ] All pools created with correct parameters
- [ ] All pools initialized at correct prices
- [ ] Protocol fees set on all pools
- [ ] Initial liquidity added to all pools

### Security Review

- [ ] Ownership transferred to multi-sig
- [ ] Fee managers audited
- [ ] Emergency procedures documented
- [ ] Monitoring set up

### Documentation

- [ ] Contract addresses documented
- [ ] Pool configurations recorded
- [ ] Fee structures documented
- [ ] Admin procedures documented
