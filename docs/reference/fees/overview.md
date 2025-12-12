# Fee Management Overview

VinuSwap extends Uniswap V3 with a flexible fee management system that allows dynamic fee computation and multi-account fee distribution.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SWAP EXECUTION                                 │
│                                                                             │
│  User → SwapRouter → VinuSwapPool.swap()                                   │
│                            │                                                │
│                            ▼                                                │
│                   ┌─────────────────┐                                      │
│                   │   feeManager    │ ← IFeeManager.computeFee(fee)        │
│                   └────────┬────────┘                                      │
│                            │                                                │
│           ┌────────────────┼────────────────┐                              │
│           ▼                ▼                ▼                              │
│  ┌─────────────────┐ ┌──────────────┐ ┌───────────────────────┐           │
│  │  TieredDiscount │ │  NoDiscount  │ │ OverridableFeeManager │           │
│  │ Balance-based   │ │  Passthrough │ │    Per-pool routing   │           │
│  │   discounts     │ │              │ │                       │           │
│  └─────────────────┘ └──────────────┘ └───────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           FEE COLLECTION                                    │
│                                                                             │
│  Pool.protocolFees → Controller.collectProtocolFees()                      │
│                            │                                                │
│                            ▼                                                │
│                   ┌─────────────────┐                                      │
│                   │   Controller    │                                      │
│                   │ Fee Distribution│                                      │
│                   └────────┬────────┘                                      │
│                            │                                                │
│           ┌────────────────┼────────────────┐                              │
│           ▼                ▼                ▼                              │
│      ┌─────────┐      ┌─────────┐      ┌─────────┐                        │
│      │Account 1│      │Account 2│      │Account 3│                        │
│      │Share: 1 │      │Share: 2 │      │Share: 2 │                        │
│      └─────────┘      └─────────┘      └─────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### IFeeManager Interface

The core interface for fee computation:

```solidity
interface IFeeManager {
    function computeFee(uint24 fee) external returns (uint24);
}
```

- Called during every swap
- Can modify the fee dynamically
- Must return a valid fee (< 1,000,000)

[Full Reference →](ifee-manager.md)

### TieredDiscount

Balance-based fee discounts:

```
User Balance >= 1,000,000 tokens → 4% fee reduction
User Balance >= 100,000 tokens  → 3% fee reduction
User Balance >= 10,000 tokens   → 2% fee reduction
User Balance >= 1,000 tokens    → 1% fee reduction
```

[Full Reference →](tiered-discount.md)

### OverridableFeeManager

Per-pool fee manager routing:

```
Pool A → TieredDiscount
Pool B → NoDiscount
Pool C → Custom fee manager
Default → TieredDiscount
```

[Full Reference →](overridable-fee-manager.md)

### Controller

Protocol fee collection and distribution:

- Collects protocol fees from pools
- Distributes to multiple accounts with configurable shares
- Manages pool creation and initialization

[Full Reference →](controller.md)

## Fee Flow

### 1. Swap Fee Application

```
Swap Amount: 1000 USDC
Pool Fee: 0.3% (3000 bps)
User Balance: 500,000 discount tokens

1. Pool calls feeManager.computeFee(3000)
2. TieredDiscount checks user balance
   - 500,000 >= 100,000 → 3% discount
3. Returns: 3000 * 0.97 = 2910 bps (0.291%)
4. Effective fee: 2.91 USDC (instead of 3 USDC)
```

### 2. Protocol Fee Split

```
Swap Fee Collected: 2.91 USDC
Protocol Fee Setting: 5 (= 1/5 = 20%)

Protocol portion: 2.91 * 0.20 = 0.582 USDC
LP portion: 2.91 * 0.80 = 2.328 USDC
```

### 3. Fee Distribution

```
Protocol Fees in Controller: 100 USDC
Shares: [Account1: 1, Account2: 2, Account3: 2]
Total Shares: 5

Account1: 100 * (1/5) = 20 USDC
Account2: 100 * (2/5) = 40 USDC
Account3: 100 * (2/5) = 40 USDC
```

## Configuration

### Setting Up Fee Management

1. **Deploy Fee Managers:**

```javascript
// Deploy TieredDiscount
const tieredDiscount = await TieredDiscount.deploy(
    discountToken,      // Token to check balance of
    [1000, 10000, 100000, 1000000],  // Thresholds
    [100, 200, 300, 400]             // Discounts in bps
);

// Deploy OverridableFeeManager
const overridable = await OverridableFeeManager.deploy(
    tieredDiscount.address  // Default manager
);
```

2. **Create Pool with Fee Manager:**

```javascript
await factory.createPool(
    tokenA,
    tokenB,
    3000,               // 0.3% fee
    60,                 // tick spacing
    tieredDiscount.address  // fee manager
);
```

3. **Configure Controller:**

```javascript
const controller = await Controller.deploy(
    factory.address,
    [account1, account2, account3],  // Fee recipients
    [1, 2, 2]                        // Shares
);
```

### Setting Protocol Fees

```javascript
// Via Controller (if owner)
await controller.setFeeProtocol(poolAddress, 5, 5);

// Directly on pool (if factory owner)
await pool.setFeeProtocol(5, 5);  // 20% protocol fee
```

### Collecting Fees

```javascript
// Collect from pool to Controller
await controller.collectProtocolFees(
    poolAddress,
    ethers.constants.MaxUint128,  // Max token0
    ethers.constants.MaxUint128   // Max token1
);

// Each account withdraws their share
await controller.connect(account1).withdraw(token0);
await controller.connect(account1).withdraw(token1);
```

## Fee Manager Implementations

### NoDiscount

Passthrough implementation - returns fee unchanged:

```solidity
contract NoDiscount is IFeeManager {
    function computeFee(uint24 fee) external pure returns (uint24) {
        return fee;
    }
}
```

### Custom Fee Managers

Create custom logic by implementing IFeeManager:

```solidity
contract TimeBasedFee is IFeeManager {
    function computeFee(uint24 fee) external view returns (uint24) {
        // Higher fees during peak hours
        if (block.timestamp % 86400 >= 32400 &&   // 9 AM
            block.timestamp % 86400 <= 61200) {   // 5 PM
            return fee * 12 / 10;  // 20% higher
        }
        return fee;
    }
}
```

```solidity
contract VolumeBasedFee is IFeeManager {
    uint256 public dailyVolume;

    function computeFee(uint24 fee) external view returns (uint24) {
        // Lower fees for high volume
        if (dailyVolume > 1_000_000e18) {
            return fee * 8 / 10;  // 20% discount
        }
        return fee;
    }
}
```

## Security Considerations

### Fee Manager Trust

- Fee managers are called during every swap
- Malicious fee managers could:
  - Return extremely high fees
  - Consume excessive gas
  - Revert to block swaps
- Only use audited fee manager implementations

### Protocol Fee Bounds

- Protocol fee is limited: 0 or 4-10 (10-25% of LP fees)
- Cannot be set to capture all fees

### Controller Access

- Only designated accounts can withdraw their shares
- Controller owner can add/remove accounts
- Consider timelock for owner operations

## Best Practices

1. **Start Simple**: Use NoDiscount initially, add complexity later
2. **Test Thoroughly**: Fee manager bugs affect every swap
3. **Monitor Gas**: Complex fee calculations increase swap costs
4. **Audit Custom Managers**: Critical path for every trade
5. **Use Multisig**: Protect owner functions with multisig/timelock

## Related

- [IFeeManager Interface](ifee-manager.md)
- [TieredDiscount](tiered-discount.md)
- [OverridableFeeManager](overridable-fee-manager.md)
- [Controller](controller.md)
- [Fee Discounts Guide](../../guides/fee-discounts.md)
