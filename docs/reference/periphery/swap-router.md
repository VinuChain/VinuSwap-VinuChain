# SwapRouter

The SwapRouter contract provides functions to execute swaps through VinuSwap pools.

**Source:** `contracts/periphery/SwapRouter.sol`

## Overview

The SwapRouter is a stateless contract that:
- Routes swaps through single or multiple pools
- Handles exact input and exact output swaps
- Manages ETH ↔ WETH conversions
- Provides deadline and slippage protection

## Inheritance

```
SwapRouter
├── ISwapRouter
├── PeripheryImmutableState
├── PeripheryValidation
├── PeripheryPaymentsWithFee
├── Multicall
└── SelfPermit
```

## Functions

### exactInputSingle

```solidity
function exactInputSingle(ExactInputSingleParams calldata params)
    external
    payable
    override
    checkDeadline(params.deadline)
    returns (uint256 amountOut)
```

Swaps a fixed amount of one token for a maximum possible amount of another.

**Parameters:**

```solidity
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}
```

| Field | Description |
|-------|-------------|
| `tokenIn` | Address of input token |
| `tokenOut` | Address of output token |
| `fee` | Pool fee tier |
| `recipient` | Output token recipient |
| `deadline` | Transaction deadline |
| `amountIn` | Exact amount to swap |
| `amountOutMinimum` | Minimum acceptable output |
| `sqrtPriceLimitX96` | Price limit (0 for no limit) |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountOut` | `uint256` | Amount of output token received |

**Example:**

```javascript
const params = {
    tokenIn: WETH,
    tokenOut: USDC,
    fee: 3000,           // 0.3%
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 1800,
    amountIn: ethers.utils.parseEther('1'),
    amountOutMinimum: ethers.utils.parseUnits('1900', 6), // Min 1900 USDC
    sqrtPriceLimitX96: 0
};

const amountOut = await router.exactInputSingle(params);
```

---

### exactInput

```solidity
function exactInput(ExactInputParams calldata params)
    external
    payable
    override
    checkDeadline(params.deadline)
    returns (uint256 amountOut)
```

Swaps a fixed amount through multiple pools (multi-hop).

**Parameters:**

```solidity
struct ExactInputParams {
    bytes path;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
}
```

| Field | Description |
|-------|-------------|
| `path` | Encoded swap path (token, fee, token, fee, token...) |
| `recipient` | Output token recipient |
| `deadline` | Transaction deadline |
| `amountIn` | Exact amount to swap |
| `amountOutMinimum` | Minimum acceptable output |

**Path Encoding:**

```javascript
// WETH → USDC → DAI
const path = ethers.utils.solidityPack(
    ['address', 'uint24', 'address', 'uint24', 'address'],
    [WETH, 3000, USDC, 500, DAI]
);
```

**Example:**

```javascript
const params = {
    path: encodePath([WETH, USDC, DAI], [3000, 500]),
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 1800,
    amountIn: ethers.utils.parseEther('1'),
    amountOutMinimum: ethers.utils.parseUnits('1850', 18)
};

const amountOut = await router.exactInput(params);
```

---

### exactOutputSingle

```solidity
function exactOutputSingle(ExactOutputSingleParams calldata params)
    external
    payable
    override
    checkDeadline(params.deadline)
    returns (uint256 amountIn)
```

Swaps a minimum possible amount of one token for a fixed amount of another.

**Parameters:**

```solidity
struct ExactOutputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountOut;
    uint256 amountInMaximum;
    uint160 sqrtPriceLimitX96;
}
```

| Field | Description |
|-------|-------------|
| `tokenIn` | Address of input token |
| `tokenOut` | Address of output token |
| `fee` | Pool fee tier |
| `recipient` | Output token recipient |
| `deadline` | Transaction deadline |
| `amountOut` | Exact amount to receive |
| `amountInMaximum` | Maximum acceptable input |
| `sqrtPriceLimitX96` | Price limit (0 for no limit) |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| `amountIn` | `uint256` | Amount of input token spent |

**Example:**

```javascript
const params = {
    tokenIn: WETH,
    tokenOut: USDC,
    fee: 3000,
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 1800,
    amountOut: ethers.utils.parseUnits('2000', 6), // Exactly 2000 USDC
    amountInMaximum: ethers.utils.parseEther('1.1'), // Max 1.1 WETH
    sqrtPriceLimitX96: 0
};

const amountIn = await router.exactOutputSingle(params);
```

---

### exactOutput

```solidity
function exactOutput(ExactOutputParams calldata params)
    external
    payable
    override
    checkDeadline(params.deadline)
    returns (uint256 amountIn)
```

Swaps a minimum possible amount through multiple pools for a fixed output.

**Parameters:**

```solidity
struct ExactOutputParams {
    bytes path;
    address recipient;
    uint256 deadline;
    uint256 amountOut;
    uint256 amountInMaximum;
}
```

**Note:** For exact output, the path is encoded in **reverse order** (output token first).

**Path Encoding for Exact Output:**

```javascript
// WETH → USDC → DAI (want DAI)
// Path is reversed: DAI → USDC → WETH
const path = ethers.utils.solidityPack(
    ['address', 'uint24', 'address', 'uint24', 'address'],
    [DAI, 500, USDC, 3000, WETH]  // Reversed!
);
```

---

### uniswapV3SwapCallback

```solidity
function uniswapV3SwapCallback(
    int256 amount0Delta,
    int256 amount1Delta,
    bytes calldata _data
) external override
```

Callback from pool during swap. Handles payment of input tokens.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `amount0Delta` | `int256` | Token0 amount owed (positive) or received (negative) |
| `amount1Delta` | `int256` | Token1 amount owed (positive) or received (negative) |
| `_data` | `bytes` | Encoded callback data |

**Note:** This is an internal callback. Do not call directly.

## Payment Functions

### unwrapWETH9

```solidity
function unwrapWETH9(uint256 amountMinimum, address recipient) external payable
```

Unwraps WETH9 to ETH.

### sweepToken

```solidity
function sweepToken(address token, uint256 amountMinimum, address recipient) external payable
```

Transfers the full balance of a token.

### refundETH

```solidity
function refundETH() external payable
```

Refunds any ETH left in the contract.

## Multicall

### multicall

```solidity
function multicall(bytes[] calldata data)
    external
    payable
    override
    returns (bytes[] memory results)
```

Executes multiple router calls in a single transaction.

**Example:**

```javascript
// Swap and unwrap in one transaction
const calls = [
    router.interface.encodeFunctionData('exactInputSingle', [swapParams]),
    router.interface.encodeFunctionData('unwrapWETH9', [minAmount, recipient])
];

await router.multicall(calls);
```

## Permit Functions

### selfPermit

```solidity
function selfPermit(
    address token,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external payable
```

Approves tokens via ERC20 permit signature.

### selfPermitIfNecessary

```solidity
function selfPermitIfNecessary(
    address token,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external payable
```

Calls permit only if current allowance is insufficient.

## Common Patterns

### Swap ETH for Tokens

```javascript
// Send ETH with the transaction (will be wrapped automatically)
const params = {
    tokenIn: WETH9,
    tokenOut: USDC,
    fee: 3000,
    recipient: userAddress,
    deadline: deadline,
    amountIn: ethers.utils.parseEther('1'),
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
};

await router.exactInputSingle(params, { value: params.amountIn });
```

### Swap Tokens for ETH

```javascript
// Use ADDRESS_ZERO as recipient to trigger unwrap
const params = {
    tokenIn: USDC,
    tokenOut: WETH9,
    fee: 3000,
    recipient: ethers.constants.AddressZero,  // ADDRESS_ZERO
    deadline: deadline,
    amountIn: ethers.utils.parseUnits('2000', 6),
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
};

// Use multicall to swap and unwrap
const calls = [
    router.interface.encodeFunctionData('exactInputSingle', [params]),
    router.interface.encodeFunctionData('unwrapWETH9', [
        ethers.utils.parseEther('0.9'),  // Minimum ETH
        userAddress                       // Actual recipient
    ])
];

await router.multicall(calls);
```

### Swap with Permit (Gasless Approval)

```javascript
// Sign permit
const permit = await signPermit(token, router.address, amount, deadline);

// Multicall permit + swap
const calls = [
    router.interface.encodeFunctionData('selfPermit', [
        token.address,
        amount,
        deadline,
        permit.v,
        permit.r,
        permit.s
    ]),
    router.interface.encodeFunctionData('exactInputSingle', [swapParams])
];

await router.multicall(calls);
```

## Error Messages

| Error | Meaning |
|-------|---------|
| `Transaction too old` | Deadline exceeded |
| `Too little received` | Output below minimum |
| `Too much requested` | Input above maximum |
| `Invalid callback` | Callback from non-pool address |

## Interface

```solidity
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut);

    function exactInput(ExactInputParams calldata params)
        external payable returns (uint256 amountOut);

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external payable returns (uint256 amountIn);

    function exactOutput(ExactOutputParams calldata params)
        external payable returns (uint256 amountIn);
}
```

## Related

- [VinuSwapQuoter](quoter.md)
- [Executing Swaps Guide](../../guides/swapping.md)
- [VinuSwapPool](../core/pool.md)
