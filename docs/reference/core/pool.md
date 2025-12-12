# VinuSwapPool

The VinuSwapPool contract implements the concentrated liquidity AMM for a specific token pair and fee tier.

**Source:** `contracts/core/VinuSwapPool.sol`

## Overview

Each pool is an independent market maker that:
- Allows concentrated liquidity provision within price ranges
- Executes swaps between the paired tokens
- Accumulates and distributes fees to liquidity providers
- Maintains a TWAP oracle for price data

## State Variables

### Immutables

```solidity
address public immutable override factory;
address public immutable override token0;
address public immutable override token1;
uint24 public immutable override fee;
int24 public immutable override tickSpacing;
uint128 public immutable override maxLiquidityPerTick;
address public immutable feeManager;
```

### Slot0

The primary state storage packed into a single slot:

```solidity
struct Slot0 {
    // Current sqrt(price) as Q64.96
    uint160 sqrtPriceX96;
    // Current tick
    int24 tick;
    // Most recent observation index
    uint16 observationIndex;
    // Maximum observations stored
    uint16 observationCardinality;
    // Next maximum observations
    uint16 observationCardinalityNext;
    // Protocol fee (4 bits each for token0/token1)
    uint8 feeProtocol;
    // Reentrancy lock
    bool unlocked;
}

Slot0 public override slot0;
```

### Fee Accumulators

```solidity
uint256 public override feeGrowthGlobal0X128;
uint256 public override feeGrowthGlobal1X128;
```

Global fee accumulation per unit of liquidity, in Q128.128 format.

### Protocol Fees

```solidity
struct ProtocolFees {
    uint128 token0;
    uint128 token1;
}
ProtocolFees public override protocolFees;
```

### Liquidity

```solidity
uint128 public override liquidity;
```

Currently active liquidity (positions covering the current tick).

### Ticks

```solidity
mapping(int24 => Tick.Info) public override ticks;
```

### Tick Bitmap

```solidity
mapping(int16 => uint256) public override tickBitmap;
```

### Positions

```solidity
mapping(bytes32 => Position.Info) public override positions;
```

### Observations

```solidity
Oracle.Observation[65535] public override observations;
```

## Functions

### initialize

```solidity
function initialize(uint160 sqrtPriceX96) external override onlyFactoryOwner
```

Sets the initial price for the pool. Can only be called once.

**Access Control:** Only callable by factory owner

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `sqrtPriceX96` | `uint160` | Initial √price in Q64.96 format |

**Requirements:**
- Caller must be factory owner
- Pool must not already be initialized
- `sqrtPriceX96` must be within valid tick range

**Events Emitted:**
- `Initialize(sqrtPriceX96, tick)`

**Example:**

```javascript
// Initialize at price 1.0 (token0 = token1)
const sqrtPriceX96 = BigNumber.from(2).pow(96);
await pool.initialize(sqrtPriceX96);
```

---

### mint

```solidity
function mint(
    address recipient,
    int24 tickLower,
    int24 tickUpper,
    uint128 amount,
    bytes calldata data
) external override lock returns (uint256 amount0, uint256 amount1)
```

Adds liquidity to a position.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `recipient` | `address` | Position owner |
| `tickLower` | `int24` | Lower tick boundary |
| `tickUpper` | `int24` | Upper tick boundary |
| `amount` | `uint128` | Liquidity amount to add |
| `data` | `bytes` | Callback data |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `uint256` | Token0 amount required |
| `amount1` | `uint256` | Token1 amount required |

**Callback:**
The pool calls `IUniswapV3MintCallback.uniswapV3MintCallback(amount0, amount1, data)` on `msg.sender`. The caller must transfer the required tokens to the pool in this callback.

**Note:** VinuSwap uses Uniswap V3's callback interfaces for compatibility.

**Events Emitted:**
- `Mint(sender, recipient, tickLower, tickUpper, amount, amount0, amount1)`

---

### burn

```solidity
function burn(
    int24 tickLower,
    int24 tickUpper,
    uint128 amount
) external override lock returns (uint256 amount0, uint256 amount1)
```

Removes liquidity from a position. Does not transfer tokens - use `collect` to withdraw.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `tickLower` | `int24` | Lower tick boundary |
| `tickUpper` | `int24` | Upper tick boundary |
| `amount` | `uint128` | Liquidity amount to remove |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `uint256` | Token0 amount owed |
| `amount1` | `uint256` | Token1 amount owed |

**Events Emitted:**
- `Burn(msg.sender, tickLower, tickUpper, amount, amount0, amount1)`

---

### collect

```solidity
function collect(
    address recipient,
    int24 tickLower,
    int24 tickUpper,
    uint128 amount0Requested,
    uint128 amount1Requested
) external override lock returns (uint128 amount0, uint128 amount1)
```

Collects tokens owed from a position (from burns and accumulated fees).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `recipient` | `address` | Token recipient |
| `tickLower` | `int24` | Lower tick boundary |
| `tickUpper` | `int24` | Upper tick boundary |
| `amount0Requested` | `uint128` | Max token0 to collect |
| `amount1Requested` | `uint128` | Max token1 to collect |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `uint128` | Token0 amount collected |
| `amount1` | `uint128` | Token1 amount collected |

**Events Emitted:**
- `Collect(msg.sender, recipient, tickLower, tickUpper, amount0, amount1)`

---

### swap

```solidity
function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    bytes calldata data
) external override lock returns (int256 amount0, int256 amount1)
```

Executes a swap.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `recipient` | `address` | Recipient of swap output |
| `zeroForOne` | `bool` | Direction: true = token0→token1 |
| `amountSpecified` | `int256` | Amount to swap (positive = exact input, negative = exact output) |
| `sqrtPriceLimitX96` | `uint160` | Price limit (stops swap if reached) |
| `data` | `bytes` | Callback data |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `int256` | Token0 delta (negative = sent, positive = received) |
| `amount1` | `int256` | Token1 delta (negative = sent, positive = received) |

**Price Limit Guidelines:**

| Direction | `sqrtPriceLimitX96` |
|-----------|---------------------|
| `zeroForOne = true` | Less than current price, greater than `MIN_SQRT_RATIO` |
| `zeroForOne = false` | Greater than current price, less than `MAX_SQRT_RATIO` |

**Callback:**
The pool calls `IUniswapV3SwapCallback.uniswapV3SwapCallback(amount0, amount1, data)` on `msg.sender`. The caller must transfer the required input tokens to the pool.

**Events Emitted:**
- `Swap(sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick)`

---

### observe

```solidity
function observe(uint32[] calldata secondsAgos)
    external
    view
    override
    returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
```

Returns cumulative values from the oracle for TWAP calculations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `secondsAgos` | `uint32[]` | Seconds ago from current time |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `tickCumulatives` | `int56[]` | Cumulative tick values |
| `secondsPerLiquidityCumulativeX128s` | `uint160[]` | Cumulative seconds per liquidity |

**Example TWAP Calculation:**

```javascript
// Get tick cumulatives for 30 minutes ago and now
const [tickCumulatives] = await pool.observe([1800, 0]);
const averageTick = (tickCumulatives[1] - tickCumulatives[0]) / 1800;
const twapPrice = Math.pow(1.0001, averageTick);
```

---

### increaseObservationCardinalityNext

```solidity
function increaseObservationCardinalityNext(uint16 observationCardinalityNext)
    external
    override
    lock
```

Increases the oracle's capacity to store more observations.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `observationCardinalityNext` | `uint16` | New cardinality |

**Note:** This operation has a one-time gas cost proportional to the increase. Call before you need the increased capacity.

---

### setFeeProtocol

```solidity
function setFeeProtocol(uint8 feeProtocol0, uint8 feeProtocol1) external override lock
```

Sets the protocol fee percentage.

**Access Control:** Only callable by factory owner

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `feeProtocol0` | `uint8` | Protocol fee for token0 (0 or 4-10) |
| `feeProtocol1` | `uint8` | Protocol fee for token1 (0 or 4-10) |

**Protocol Fee Calculation:**
- Fee = `1/feeProtocol` of swap fees
- `feeProtocol = 4` → 25% to protocol
- `feeProtocol = 5` → 20% to protocol
- `feeProtocol = 10` → 10% to protocol
- `feeProtocol = 0` → no protocol fee

**Events Emitted:**
- `SetFeeProtocol(feeProtocol0Old, feeProtocol1Old, feeProtocol0, feeProtocol1)`

---

### collectProtocol

```solidity
function collectProtocol(
    address recipient,
    uint128 amount0Requested,
    uint128 amount1Requested
) external override lock returns (uint128 amount0, uint128 amount1)
```

Collects accumulated protocol fees.

**Access Control:** Only callable by factory owner

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `recipient` | `address` | Fee recipient |
| `amount0Requested` | `uint128` | Max token0 to collect |
| `amount1Requested` | `uint128` | Max token1 to collect |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amount0` | `uint128` | Token0 collected |
| `amount1` | `uint128` | Token1 collected |

**Events Emitted:**
- `CollectProtocol(msg.sender, recipient, amount0, amount1)`

## Events

### Initialize

```solidity
event Initialize(uint160 sqrtPriceX96, int24 tick);
```

### Mint

```solidity
event Mint(
    address sender,
    address indexed owner,
    int24 indexed tickLower,
    int24 indexed tickUpper,
    uint128 amount,
    uint256 amount0,
    uint256 amount1
);
```

### Burn

```solidity
event Burn(
    address indexed owner,
    int24 indexed tickLower,
    int24 indexed tickUpper,
    uint128 amount,
    uint256 amount0,
    uint256 amount1
);
```

### Swap

```solidity
event Swap(
    address indexed sender,
    address indexed recipient,
    int256 amount0,
    int256 amount1,
    uint160 sqrtPriceX96,
    uint128 liquidity,
    int24 tick
);
```

### Collect

```solidity
event Collect(
    address indexed owner,
    address recipient,
    int24 indexed tickLower,
    int24 indexed tickUpper,
    uint128 amount0,
    uint128 amount1
);
```

### SetFeeProtocol

```solidity
event SetFeeProtocol(
    uint8 feeProtocol0Old,
    uint8 feeProtocol1Old,
    uint8 feeProtocol0New,
    uint8 feeProtocol1New
);
```

### CollectProtocol

```solidity
event CollectProtocol(
    address indexed sender,
    address indexed recipient,
    uint128 amount0,
    uint128 amount1
);
```

## Error Codes

| Code | Meaning |
|------|---------|
| `LOK` | Locked - reentrancy detected |
| `TLU` | Tick lower >= tick upper |
| `TLM` | Tick lower < MIN_TICK |
| `TUM` | Tick upper > MAX_TICK |
| `AI` | Already initialized |
| `M0` | Mint amount is 0 |
| `AS` | Amount specified is 0 |
| `IIA` | Invalid input amount |
| `SPL` | Invalid sqrt price limit |
| `L` | Liquidity overflow |

## Constants

```solidity
int24 internal constant MIN_TICK = -887272;
int24 internal constant MAX_TICK = 887272;
uint160 internal constant MIN_SQRT_RATIO = 4295128739;
uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;
```

## Related

- [VinuSwapFactory](factory.md)
- [SwapRouter](../periphery/swap-router.md)
- [NonfungiblePositionManager](../periphery/position-manager.md)
