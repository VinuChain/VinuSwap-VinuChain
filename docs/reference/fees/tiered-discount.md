# TieredDiscount

The TieredDiscount contract provides fee discounts based on a user's token balance.

**Source:** `contracts/periphery/TieredDiscount.sol`

## Overview

TieredDiscount implements IFeeManager to provide progressive fee discounts:
- Users holding more tokens receive larger discounts
- Discounts are applied during swap execution
- Configurable thresholds and discount rates

## State Variables

### DENOMINATOR

```solidity
uint256 public constant DENOMINATOR = 10000;
```

Constant used for basis point calculations (10000 = 100%).

### token

```solidity
address public token;
```

The ERC20 token whose balance determines discount eligibility.

### thresholds

```solidity
uint256[] public thresholds;
```

Balance thresholds for each discount tier (ascending order).

### discounts

```solidity
uint16[] public discounts;
```

Discount amounts in basis points for each tier.

## Constructor

```solidity
constructor(
    address _token,
    uint256[] memory _thresholds,
    uint16[] memory _discounts
)
```

| Parameter | Description |
|-----------|-------------|
| `_token` | Token to check balance of |
| `_thresholds` | Balance thresholds (must be ascending) |
| `_discounts` | Discount bps for each threshold |

**Example:**

```solidity
TieredDiscount discount = new TieredDiscount(
    VINU_TOKEN,
    [
        1000 * 10**18,      // 1,000 tokens
        10000 * 10**18,     // 10,000 tokens
        100000 * 10**18,    // 100,000 tokens
        1000000 * 10**18    // 1,000,000 tokens
    ],
    [100, 200, 300, 400]    // 1%, 2%, 3%, 4% discounts
);
```

## Functions

### computeFee

```solidity
function computeFee(uint24 fee) external view override returns (uint24)
```

Computes the discounted fee based on the caller's token balance.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fee` | `uint24` | Base fee in hundredths of a bip |

**Returns:**

| Type | Description |
|------|-------------|
| `uint24` | Discounted fee |

**Logic:**

```solidity
function computeFee(uint24 fee) external view override returns (uint24) {
    // Note the usage of tx.origin instead of msg.sender
    return computeFeeFor(fee, tx.origin);
}
```

**Example Calculation:**

```
Base fee: 3000 (0.3%)
User balance: 50,000 tokens
Applicable discount: 200 bps (2%)

Discounted fee = 3000 * (10000 - 200) / 10000
               = 3000 * 9800 / 10000
               = 2940 (0.294%)
```

---

### computeFeeFor

```solidity
function computeFeeFor(uint24 fee, address recipient) public view returns (uint24)
```

Computes the fee for an arbitrary address. Useful for simulating fees before swapping.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `fee` | `uint24` | Base fee in hundredths of a bip |
| `recipient` | `address` | Address to check balance for |

**Returns:**

| Type | Description |
|------|-------------|
| `uint24` | Discounted fee |

---

### updateInfo

```solidity
function updateInfo(
    address _token,
    uint256[] memory _thresholds,
    uint16[] memory _discounts
) public onlyOwner
```

Updates the token, thresholds, and discounts configuration.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `_token` | `address` | Token to check balance of |
| `_thresholds` | `uint256[]` | New thresholds (ascending order, positive values) |
| `_discounts` | `uint16[]` | New discounts in bps (ascending order, <= 10000) |

**Requirements:**
- Arrays must not be empty
- Arrays must have the same length
- Thresholds must be positive and strictly increasing
- Discounts must be strictly increasing and <= 10000 (100%)

**Example:**

```javascript
// Update to new configuration
await tieredDiscount.updateInfo(
    NEW_TOKEN_ADDRESS,
    [
        ethers.utils.parseEther('500'),    // Lower entry point
        ethers.utils.parseEther('5000'),
        ethers.utils.parseEther('50000'),
        ethers.utils.parseEther('500000')
    ],
    [150, 300, 450, 600]  // 1.5%, 3%, 4.5%, 6%
);
```

## Discount Tiers

### Default Configuration

| Tier | Balance Threshold | Discount |
|------|-------------------|----------|
| 1 | ≥ 1,000 tokens | 1% (100 bps) |
| 2 | ≥ 10,000 tokens | 2% (200 bps) |
| 3 | ≥ 100,000 tokens | 3% (300 bps) |
| 4 | ≥ 1,000,000 tokens | 4% (400 bps) |

### Tier Selection Logic

```solidity
uint16 bestDiscount = 0;

for (uint256 i = 0; i < thresholds.length; i++) {
    if (balance >= thresholds[i]) {
        bestDiscount = discounts[i];
    } else {
        break;
    }
}
```

The function iterates through thresholds in ascending order and selects the highest applicable discount.

## Usage Examples

### Checking Effective Discount

```javascript
// Get user's discount tier
const balance = await discountToken.balanceOf(userAddress);
const thresholds = await Promise.all([
    tieredDiscount.thresholds(0),
    tieredDiscount.thresholds(1),
    tieredDiscount.thresholds(2),
    tieredDiscount.thresholds(3)
]);
const discounts = await Promise.all([
    tieredDiscount.discounts(0),
    tieredDiscount.discounts(1),
    tieredDiscount.discounts(2),
    tieredDiscount.discounts(3)
]);

let userDiscount = 0;
for (let i = 0; i < thresholds.length; i++) {
    if (balance.gte(thresholds[i])) {
        userDiscount = discounts[i];
    } else {
        break;
    }
}

console.log(`User discount: ${userDiscount / 100}%`);
```

### Simulating Discounted Fee

```javascript
// Simulate fee for a specific user
const baseFee = 3000; // 0.3%
const discountedFee = await tieredDiscount.computeFeeFor(baseFee, userAddress);
console.log(`Effective fee: ${discountedFee / 10000}%`);
```

### Manual Calculation

```javascript
const baseFee = 3000; // 0.3%
const userDiscount = 200; // 2%

const discountedFee = baseFee * (10000 - userDiscount) / 10000;
console.log(`Effective fee: ${discountedFee / 10000}%`); // 0.294%
```

## Integration

### Pool Creation

```javascript
// Deploy TieredDiscount
const tieredDiscount = await TieredDiscount.deploy(
    VINU_TOKEN,
    thresholds,
    discounts
);

// Create pool with TieredDiscount as fee manager
await factory.createPool(
    tokenA,
    tokenB,
    3000,  // 0.3% base fee
    60,    // tick spacing
    tieredDiscount.address  // fee manager
);
```

### With OverridableFeeManager

```javascript
// Use TieredDiscount as default
const overridable = await OverridableFeeManager.deploy(
    tieredDiscount.address
);

// Override specific pools with NoDiscount
await overridable.setOverride(stablePool, noDiscount.address);
```

## Security Considerations

### tx.origin Usage

The contract uses `tx.origin` to determine the swapper's balance:

```solidity
return computeFeeFor(fee, tx.origin);
```

**Implications:**
- Discounts apply to the original transaction sender
- Contracts calling on behalf of users may not receive expected discounts
- Flash loan attacks cannot easily exploit discounts

### Token Balance Manipulation

**Risk:** Users could temporarily acquire tokens to get discounts.

**Mitigations:**
- Require minimum holding period
- Use time-weighted average balance
- Integrate with staking for eligibility

### Owner Privileges

The owner can:
- Change token, thresholds, and discounts at any time via `updateInfo()`

**Recommendations:**
- Use multisig for ownership
- Add timelock for configuration changes
- Consider immutable deployments

## Related

- [IFeeManager Interface](ifee-manager.md)
- [OverridableFeeManager](overridable-fee-manager.md)
- [Fee Discounts Guide](../../guides/fee-discounts.md)
