# Controller

The Controller contract manages pool creation, protocol fee collection, and fee distribution to multiple accounts.

**Source:** `contracts/periphery/Controller.sol`

## Overview

The Controller provides:
- Pool creation wrapper with ownership control
- Standard pool creation with default parameters
- Protocol fee collection from pools
- Multi-account fee distribution with configurable shares
- Pool initialization and fee configuration
- Factory ownership management

## State Variables

### accounts

```solidity
address[] public accounts;
```

Array of addresses receiving fee distributions.

### shares

```solidity
mapping(address => uint256) public shares;
```

Distribution shares for each account.

### totalShares

```solidity
uint256 public totalShares;
```

Sum of all shares (for proportional calculation).

### defaultFeeManager

```solidity
mapping(address => address) public defaultFeeManager;
```

Default fee manager for each factory (used by `createStandardPool`).

### defaultTickSpacing

```solidity
mapping(address => mapping(uint24 => int24)) public defaultTickSpacing;
```

Default tick spacing for each factory and fee tier (used by `createStandardPool`).

## Constructor

```solidity
constructor(
    address[] memory _accounts,
    uint256[] memory _shares
)
```

| Parameter | Description |
|-----------|-------------|
| `_accounts` | Initial fee recipient addresses |
| `_shares` | Initial distribution shares |

**Requirements:**
- At least one account required
- Accounts and shares arrays must have same length
- No zero addresses
- All shares must be greater than zero

**Example:**

```solidity
Controller controller = new Controller(
    [treasury, devFund, burnAddress],  // Recipients
    [2, 2, 1]                          // 40%, 40%, 20%
);
```

## Functions

### createPool

```solidity
function createPool(
    address factory,
    address tokenA,
    address tokenB,
    uint24 fee,
    int24 tickSpacing,
    address feeManager,
    uint160 sqrtPriceX96
) external onlyOwner nonReentrant returns (address pool)
```

Creates and initializes a new pool via the specified factory.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `address` | Factory contract to use |
| `tokenA` | `address` | First token |
| `tokenB` | `address` | Second token |
| `fee` | `uint24` | Pool fee |
| `tickSpacing` | `int24` | Tick spacing |
| `feeManager` | `address` | Fee manager contract |
| `sqrtPriceX96` | `uint160` | Initial sqrt price |

**Returns:** Address of the created pool

**Events:** `PoolCreated(token0, token1, fee, factory, tickSpacing, feeManager, sqrtPriceX96, pool)`

---

### createStandardPool

```solidity
function createStandardPool(
    address factory,
    address tokenA,
    address tokenB,
    uint24 fee,
    uint160 sqrtPriceX96
) external nonReentrant returns (address pool)
```

Creates a pool using pre-configured default fee manager and tick spacing.

**Access Control:** Any caller (uses pre-set defaults)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `address` | Factory contract to use |
| `tokenA` | `address` | First token |
| `tokenB` | `address` | Second token |
| `fee` | `uint24` | Pool fee tier |
| `sqrtPriceX96` | `uint160` | Initial sqrt price |

**Requirements:**
- Default fee manager must be set for the factory
- Default tick spacing must be set for the factory/fee combination

**Returns:** Address of the created pool

---

### setDefaultFeeManager

```solidity
function setDefaultFeeManager(address factory, address feeManager) external onlyOwner
```

Sets the default fee manager for standard pool creation.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `address` | Factory address |
| `feeManager` | `address` | Default fee manager (zero to disable) |

---

### setDefaultTickSpacing

```solidity
function setDefaultTickSpacing(address factory, uint24 fee, int24 tickSpacing) external onlyOwner
```

Sets the default tick spacing for standard pool creation.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `address` | Factory address |
| `fee` | `uint24` | Fee tier |
| `tickSpacing` | `int24` | Default tick spacing (0 to disable, max 16383) |

---

### initialize

```solidity
function initialize(address pool, uint160 sqrtPriceX96) external onlyOwner nonReentrant
```

Initializes a pool with its starting price.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | Pool to initialize |
| `sqrtPriceX96` | `uint160` | Initial sqrt price |

**Events:** `Initialize(pool, sqrtPriceX96)`

---

### setFeeProtocol

```solidity
function setFeeProtocol(
    address pool,
    uint8 feeProtocol0,
    uint8 feeProtocol1
) external onlyOwner nonReentrant
```

Sets the protocol fee for a pool.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | Pool address |
| `feeProtocol0` | `uint8` | Token0 protocol fee (0 or 4-10) |
| `feeProtocol1` | `uint8` | Token1 protocol fee (0 or 4-10) |

**Events:** `SetFeeProtocol(pool, feeProtocol0, feeProtocol1)`

---

### collectProtocolFees

```solidity
function collectProtocolFees(
    address pool,
    uint128 amount0Requested,
    uint128 amount1Requested
) external nonReentrant
```

Collects protocol fees from a pool and distributes to accounts.

**Access Control:** Any account in the accounts array OR the owner

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | Pool to collect from |
| `amount0Requested` | `uint128` | Maximum token0 to collect |
| `amount1Requested` | `uint128` | Maximum token1 to collect |

**Distribution Logic:**

```solidity
for (uint i = 0; i < accounts.length; i++) {
    _balances[accounts[i]][token0] += amount0 * shares[accounts[i]] / totalShares;
    _balances[accounts[i]][token1] += amount1 * shares[accounts[i]] / totalShares;
}
// Dust (rounding remainder) goes to first account
```

**Events:** `CollectedFees(pool, token0, token1, amount0, amount1)`

---

### withdraw

```solidity
function withdraw(address token, uint256 amount) external nonReentrant
```

Withdraws accumulated fees for the caller.

**Access Control:** Any caller with a balance

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token to withdraw |
| `amount` | `uint256` | Amount to withdraw |

**Requirements:**
- Amount must be greater than zero
- Caller must have sufficient balance

**Events:** `Withdrawal(account, token, amount)`

---

### balanceOf

```solidity
function balanceOf(address account, address token) public view returns (uint256)
```

Returns the pending balance for an account.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account address |
| `token` | `address` | Token address |

**Returns:** Pending balance

---

### transferFactoryOwnership

```solidity
function transferFactoryOwnership(address factory, address newOwner) external onlyOwner nonReentrant
```

Transfers ownership of a factory to a new address.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `factory` | `address` | Factory address |
| `newOwner` | `address` | New owner address |

## Events

```solidity
event CollectedFees(
    address indexed pool,
    address indexed token0,
    address indexed token1,
    uint256 amount0,
    uint256 amount1
);

event Withdrawal(
    address indexed account,
    address indexed token,
    uint256 amount
);

event PoolCreated(
    address indexed token0,
    address indexed token1,
    uint24 indexed fee,
    address factory,
    int24 tickSpacing,
    address feeManager,
    uint160 sqrtPriceX96,
    address pool
);

event SetFeeProtocol(address indexed pool, uint8 feeProtocol0, uint8 feeProtocol1);

event Initialize(address indexed pool, uint160 sqrtPriceX96);
```

## Usage Examples

### Initial Setup

```javascript
// Deploy Controller with fee distribution
const controller = await Controller.deploy(
    [
        treasury.address,    // DAO treasury
        devFund.address,     // Development fund
        burnAddress          // Burn for deflation
    ],
    [2, 2, 1]  // 40%, 40%, 20%
);

// Transfer factory ownership to controller
await factory.setOwner(controller.address);

// Set up defaults for standard pool creation
await controller.setDefaultFeeManager(factory.address, tieredDiscount.address);
await controller.setDefaultTickSpacing(factory.address, 3000, 60);  // 0.3% fee → 60 tick spacing
await controller.setDefaultTickSpacing(factory.address, 500, 10);   // 0.05% fee → 10 tick spacing
```

### Pool Creation

```javascript
// Option 1: Create pool with full control (owner only)
const poolAddress = await controller.createPool(
    factory.address,
    WVC,
    USDT,
    3000,                    // 0.3% fee
    60,                      // tick spacing
    tieredDiscount.address,  // fee manager
    sqrtPriceX96             // initial price
);

// Option 2: Create standard pool (anyone, uses defaults)
const standardPool = await controller.createStandardPool(
    factory.address,
    WVC,
    USDT,
    3000,        // 0.3% fee (tick spacing from defaults)
    sqrtPriceX96 // initial price
);
```

### Fee Collection Workflow

```javascript
// Any account or owner can collect fees
const pools = [pool1, pool2, pool3];

for (const pool of pools) {
    await controller.collectProtocolFees(
        pool,
        ethers.constants.MaxUint128,
        ethers.constants.MaxUint128
    );
}

// Each account withdraws their share
const myBalance = await controller.balanceOf(myAddress, WVC);
if (myBalance.gt(0)) {
    await controller.withdraw(WVC, myBalance);
}
```

### Checking Balances

```javascript
// Check pending balance for an account
const pendingWVC = await controller.balanceOf(treasury.address, WVC);
const pendingUSDT = await controller.balanceOf(treasury.address, USDT);

console.log('Treasury pending:', {
    WVC: ethers.utils.formatEther(pendingWVC),
    USDT: ethers.utils.formatUnits(pendingUSDT, 6)
});
```

## Distribution Calculation

### Share Proportions

```
Accounts: [Treasury, DevFund, Burn]
Shares:   [2, 2, 1]
Total:    5

Distribution of 100 USDT:
- Treasury: 100 * 2/5 = 40 USDT
- DevFund:  100 * 2/5 = 40 USDT
- Burn:     100 * 1/5 = 20 USDT
```

### Rounding

Due to integer division, small amounts may be lost to rounding:

```
Shares: [1, 1, 1], Total: 3
Amount: 10 tokens

Each account: 10 / 3 = 3 tokens
Lost to rounding: 10 - (3 * 3) = 1 token

Note: Rounding dust is given to the first account
```

## Security Considerations

### Owner Privileges

The owner can:
- Create pools with custom parameters
- Set protocol fees
- Initialize pools
- Set default parameters for standard pools
- Transfer factory ownership

**Recommendations:**
- Use multisig for owner address
- Add timelock for configuration changes
- Consider governance for major decisions

### Fee Collection

- Any registered account OR the owner can trigger fee collection
- Fees are automatically distributed to all accounts based on shares
- Each account can only withdraw their own balance

### Account Configuration

- Accounts and shares are set at construction time
- There is no public function to add/remove accounts after deployment
- Consider deploying a new Controller if account changes are needed

## Integration with Factory

When Controller owns the factory:

```
Controller Owner
      │
      ▼
  Controller ────owns────▶ Factory
      │                        │
      │ createPool()           │ creates
      │ createStandardPool()   │
      │ setFeeProtocol()       │
      ▼                        ▼
  Protocol Fees ◀─────── VinuSwapPools
```

## Related

- [VinuSwapFactory](../core/factory.md)
- [VinuSwapPool](../core/pool.md)
- [Fee Management Overview](overview.md)
