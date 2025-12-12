# Controller

The Controller contract manages pool creation, protocol fee collection, and fee distribution to multiple accounts.

**Source:** `contracts/periphery/Controller.sol`

## Overview

The Controller provides:
- Pool creation wrapper with ownership control
- Protocol fee collection from pools
- Multi-account fee distribution with configurable shares
- Pool initialization and fee configuration

## State Variables

### factory

```solidity
IVinuSwapFactory public immutable factory;
```

Reference to the VinuSwap factory.

### accounts

```solidity
address[] public accounts;
```

Array of addresses receiving fee distributions.

### shares

```solidity
uint256[] public shares;
```

Distribution shares for each account (parallel array with accounts).

### totalShares

```solidity
uint256 public totalShares;
```

Sum of all shares (for proportional calculation).

### balances

```solidity
mapping(address => mapping(address => uint256)) public balances;
```

Mapping: `account → token → balance`

Tracks pending withdrawals for each account and token.

## Constructor

```solidity
constructor(
    address _factory,
    address[] memory _accounts,
    uint256[] memory _shares
)
```

| Parameter | Description |
|-----------|-------------|
| `_factory` | VinuSwap factory address |
| `_accounts` | Initial fee recipient addresses |
| `_shares` | Initial distribution shares |

**Example:**

```solidity
Controller controller = new Controller(
    factory.address,
    [treasury, devFund, burnAddress],  // Recipients
    [2, 2, 1]                          // 40%, 40%, 20%
);
```

## Functions

### createPool

```solidity
function createPool(
    address tokenA,
    address tokenB,
    uint24 fee,
    int24 tickSpacing,
    address feeManager
) external onlyOwner returns (address pool)
```

Creates a new pool via the factory.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tokenA` | `address` | First token |
| `tokenB` | `address` | Second token |
| `fee` | `uint24` | Pool fee |
| `tickSpacing` | `int24` | Tick spacing |
| `feeManager` | `address` | Fee manager contract |

**Events:** `PoolCreated(pool, tokenA, tokenB, fee)`

---

### initialize

```solidity
function initialize(address pool, uint160 sqrtPriceX96) external onlyOwner
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
) external onlyOwner
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
    uint128 amount0Max,
    uint128 amount1Max
) external onlyOwner returns (uint128 amount0, uint128 amount1)
```

Collects protocol fees from a pool and distributes to accounts.

**Access Control:** Owner only

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | Pool to collect from |
| `amount0Max` | `uint128` | Maximum token0 to collect |
| `amount1Max` | `uint128` | Maximum token1 to collect |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `uint128` | Token0 amount collected |
| `amount1` | `uint128` | Token1 amount collected |

**Distribution Logic:**

```solidity
for (uint i = 0; i < accounts.length; i++) {
    balances[accounts[i]][token0] += amount0 * shares[i] / totalShares;
    balances[accounts[i]][token1] += amount1 * shares[i] / totalShares;
}
```

**Events:** `CollectedFees(pool, amount0, amount1)`

---

### withdraw

```solidity
function withdraw(address token) external returns (uint256 amount)
```

Withdraws accumulated fees for the caller.

**Access Control:** Any account in the accounts array

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token to withdraw |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount` | `uint256` | Amount withdrawn |

**Events:** `Withdrawal(msg.sender, token, amount)`

---

### addAccount

```solidity
function addAccount(address account, uint256 share) external onlyOwner
```

Adds a new account to fee distribution.

**Access Control:** Owner only

---

### removeAccount

```solidity
function removeAccount(address account) external onlyOwner
```

Removes an account from fee distribution.

**Access Control:** Owner only

**Note:** Account must withdraw pending balances first.

---

### updateShare

```solidity
function updateShare(address account, uint256 newShare) external onlyOwner
```

Updates an account's distribution share.

**Access Control:** Owner only

## Events

```solidity
event PoolCreated(address indexed pool, address token0, address token1, uint24 fee);
event Initialize(address indexed pool, uint160 sqrtPriceX96);
event SetFeeProtocol(address indexed pool, uint8 feeProtocol0, uint8 feeProtocol1);
event CollectedFees(address indexed pool, uint128 amount0, uint128 amount1);
event Withdrawal(address indexed account, address indexed token, uint256 amount);
event AccountAdded(address indexed account, uint256 share);
event AccountRemoved(address indexed account);
event ShareUpdated(address indexed account, uint256 oldShare, uint256 newShare);
```

## Usage Examples

### Initial Setup

```javascript
// Deploy Controller with fee distribution
const controller = await Controller.deploy(
    factory.address,
    [
        treasury.address,    // DAO treasury
        devFund.address,     // Development fund
        burnAddress          // Burn for deflation
    ],
    [2, 2, 1]  // 40%, 40%, 20%
);

// Transfer factory ownership to controller
await factory.setOwner(controller.address);
```

### Pool Lifecycle

```javascript
// 1. Create pool
const poolAddress = await controller.createPool(
    WETH, USDC, 3000, 60, tieredDiscount.address
);

// 2. Initialize with starting price
const sqrtPriceX96 = encodeSqrtRatioX96(2000, 1);  // 1 ETH = 2000 USDC
await controller.initialize(poolAddress, sqrtPriceX96);

// 3. Set protocol fee (20%)
await controller.setFeeProtocol(poolAddress, 5, 5);
```

### Fee Collection Workflow

```javascript
// Collect from all pools periodically
const pools = [pool1, pool2, pool3];

for (const pool of pools) {
    const [amount0, amount1] = await controller.collectProtocolFees(
        pool,
        ethers.constants.MaxUint128,
        ethers.constants.MaxUint128
    );
    console.log(`Collected from ${pool}: ${amount0}, ${amount1}`);
}

// Each account withdraws their share
for (const account of [treasury, devFund]) {
    const signer = await ethers.getSigner(account);
    await controller.connect(signer).withdraw(WETH);
    await controller.connect(signer).withdraw(USDC);
}
```

### Checking Balances

```javascript
// Check pending balance for an account
const pendingWETH = await controller.balances(treasury.address, WETH);
const pendingUSDC = await controller.balances(treasury.address, USDC);

console.log('Treasury pending:', {
    WETH: ethers.utils.formatEther(pendingWETH),
    USDC: ethers.utils.formatUnits(pendingUSDC, 6)
});
```

### Modifying Distribution

```javascript
// Add new account
await controller.addAccount(newPartner.address, 1);  // Now: 2, 2, 1, 1 = 6 total

// Update existing share
await controller.updateShare(devFund.address, 3);  // Now: 2, 3, 1, 1 = 7 total

// Remove account (must withdraw first)
await controller.connect(burnAddress).withdraw(WETH);
await controller.connect(burnAddress).withdraw(USDC);
await controller.removeAccount(burnAddress);
```

## Distribution Calculation

### Share Proportions

```
Accounts: [Treasury, DevFund, Burn]
Shares:   [2, 2, 1]
Total:    5

Distribution of 100 USDC:
- Treasury: 100 * 2/5 = 40 USDC
- DevFund:  100 * 2/5 = 40 USDC
- Burn:     100 * 1/5 = 20 USDC
```

### Rounding

Due to integer division, small amounts may be lost to rounding:

```
Shares: [1, 1, 1], Total: 3
Amount: 10 tokens

Each account: 10 / 3 = 3 tokens
Lost to rounding: 10 - (3 * 3) = 1 token

Note: Lost tokens remain in controller contract
```

## Security Considerations

### Owner Privileges

The owner can:
- Create pools
- Set protocol fees
- Collect and distribute fees
- Add/remove accounts
- Change shares

**Recommendations:**
- Use multisig for owner address
- Add timelock for configuration changes
- Consider governance for major decisions

### Withdrawal Security

- Only accounts in the array can withdraw
- Each account can only withdraw their own balance
- Balances are tracked per token

### Fee Collection Timing

- Anyone can see pending protocol fees in pools
- Collect regularly to distribute to accounts
- Consider automated collection via keeper

## Integration with Factory

When Controller owns the factory:

```
Controller Owner
      │
      ▼
  Controller ────owns────▶ Factory
      │                        │
      │ createPool()           │ creates
      │ setFeeProtocol()       │
      ▼                        ▼
  Protocol Fees ◀─────── VinuSwapPools
```

## Related

- [VinuSwapFactory](../core/factory.md)
- [VinuSwapPool](../core/pool.md)
- [Fee Management Overview](overview.md)
