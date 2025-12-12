# OverridableFeeManager

The OverridableFeeManager routes fee computation to different managers based on the calling pool.

**Source:** `contracts/periphery/OverridableFeeManager.sol`

## Overview

OverridableFeeManager allows:
- Per-pool fee manager customization
- Default fee manager for pools without overrides
- Runtime configuration changes

## State Variables

### defaultFeeManager

```solidity
address public defaultFeeManager;
```

The fee manager used when no override is set for a pool.

### overrides

```solidity
mapping(address => address) public overrides;
```

Pool-specific fee manager overrides.

## Constructor

```solidity
constructor(address _defaultFeeManager)
```

| Parameter | Description |
|-----------|-------------|
| `_defaultFeeManager` | Default fee manager for pools without overrides |

**Example:**

```solidity
OverridableFeeManager manager = new OverridableFeeManager(
    tieredDiscount.address  // Default to tiered discounts
);
```

## Functions

### computeFee

```solidity
function computeFee(uint24 fee) external override returns (uint24)
```

Routes fee computation to the appropriate manager.

**Logic:**

```solidity
function computeFee(uint24 fee) external override returns (uint24) {
    address manager = overrides[msg.sender];

    if (manager == address(0)) {
        manager = defaultFeeManager;
    }

    return IFeeManager(manager).computeFee(fee);
}
```

**Flow:**

```
Pool calls computeFee(fee)
    │
    ▼
Override exists for pool?
    │
    ├─ YES → Use override manager
    │
    └─ NO → Use default manager
    │
    ▼
Return computed fee
```

---

### setOverride

```solidity
function setOverride(address pool, address feeManager) external onlyOwner
```

Sets a fee manager override for a specific pool.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | Pool address to override |
| `feeManager` | `address` | Fee manager for this pool (address(0) to remove) |

**Example:**

```javascript
// Set override for stable pool (no discounts)
await overridable.setOverride(stablePool.address, noDiscount.address);

// Remove override (revert to default)
await overridable.setOverride(stablePool.address, ethers.constants.AddressZero);
```

---

### setDefaultFeeManager

```solidity
function setDefaultFeeManager(address _defaultFeeManager) external onlyOwner
```

Updates the default fee manager.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_defaultFeeManager` | `address` | New default fee manager |

## Usage Patterns

### Different Managers for Different Pool Types

```javascript
// Deploy fee managers
const tieredDiscount = await TieredDiscount.deploy(...);
const noDiscount = await NoDiscount.deploy();
const volumeDiscount = await VolumeDiscount.deploy(...);

// Deploy OverridableFeeManager with tiered as default
const overridable = await OverridableFeeManager.deploy(tieredDiscount.address);

// Create pools with the overridable manager
const volatilePool = await factory.createPool(
    ETH, USDC, 3000, 60, overridable.address
);

const stablePool = await factory.createPool(
    USDC, DAI, 100, 1, overridable.address
);

const whalePol = await factory.createPool(
    ETH, BTC, 500, 10, overridable.address
);

// Configure overrides
await overridable.setOverride(stablePool, noDiscount.address);  // No discount for stables
await overridable.setOverride(whalePool, volumeDiscount.address);  // Volume-based for whales

// Result:
// - volatilePool → tieredDiscount (default)
// - stablePool → noDiscount
// - whalePool → volumeDiscount
```

### Gradual Rollout

```javascript
// Start with no discounts everywhere
const overridable = await OverridableFeeManager.deploy(noDiscount.address);

// ... create pools ...

// Later, enable discounts for specific pools
await overridable.setOverride(popularPool, tieredDiscount.address);

// Eventually, make discounts the default
await overridable.setDefaultFeeManager(tieredDiscount.address);
```

### Emergency Disable

```javascript
// If TieredDiscount has a bug, quickly disable
await overridable.setDefaultFeeManager(noDiscount.address);

// Or disable for specific pool
await overridable.setOverride(affectedPool, noDiscount.address);
```

## Configuration Examples

### Stable Pairs No Discount

```
Default: TieredDiscount
Overrides:
  - USDC/USDT → NoDiscount
  - USDC/DAI → NoDiscount
  - DAI/USDT → NoDiscount
```

### Premium Pools

```
Default: NoDiscount
Overrides:
  - ETH/USDC (main) → TieredDiscount
  - BTC/ETH (main) → TieredDiscount
```

### Test vs Production

```
Default: NoDiscount (conservative)
Overrides:
  - TestPool → TieredDiscount (testing new logic)
```

## Querying Configuration

```javascript
// Check default manager
const defaultManager = await overridable.defaultFeeManager();
console.log('Default:', defaultManager);

// Check specific pool override
const poolOverride = await overridable.overrides(poolAddress);
if (poolOverride === ethers.constants.AddressZero) {
    console.log('Pool uses default manager');
} else {
    console.log('Pool override:', poolOverride);
}

// Determine actual manager for a pool
async function getPoolFeeManager(pool) {
    const override = await overridable.overrides(pool);
    return override === ethers.constants.AddressZero
        ? await overridable.defaultFeeManager()
        : override;
}
```

## Gas Considerations

OverridableFeeManager adds one extra external call:

```
Without Override:
  Pool → OverridableFeeManager → DefaultManager.computeFee()

With Override:
  Pool → OverridableFeeManager → OverrideManager.computeFee()
```

**Approximate Additional Gas:** ~2,600 (SLOAD for mapping lookup)

## Security Considerations

### Manager Validation

The contract doesn't validate that override addresses implement IFeeManager:

```solidity
// Owner should verify before setting
require(
    IFeeManager(feeManager).computeFee(1000) > 0,
    "Invalid fee manager"
);
await overridable.setOverride(pool, feeManager);
```

### Access Control

Only owner can modify configuration:
- Consider using multisig
- Add timelock for production deployments
- Log all configuration changes

### Default Manager Trust

All pools without overrides use the default:
- Ensure default manager is well-tested
- Be cautious changing default on live systems

## Events

```solidity
event OverrideSet(address indexed pool, address indexed feeManager);
event DefaultFeeManagerUpdated(address indexed feeManager);
```

## Interface

```solidity
interface IOverridableFeeManager is IFeeManager {
    function defaultFeeManager() external view returns (address);
    function overrides(address pool) external view returns (address);
    function setOverride(address pool, address feeManager) external;
    function setDefaultFeeManager(address _defaultFeeManager) external;
}
```

## Related

- [IFeeManager Interface](ifee-manager.md)
- [TieredDiscount](tiered-discount.md)
- [Controller](controller.md)
