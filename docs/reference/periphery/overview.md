# Periphery Contracts Overview

Periphery contracts provide user-friendly interfaces to interact with VinuSwap core pools.

## Contract Summary

| Contract | Purpose | Source |
|----------|---------|--------|
| [SwapRouter](swap-router.md) | Execute token swaps | `contracts/periphery/SwapRouter.sol` |
| [NonfungiblePositionManager](position-manager.md) | NFT position management | `contracts/periphery/NonfungiblePositionManager.sol` |
| [VinuSwapQuoter](quoter.md) | Estimate swap amounts | `contracts/periphery/VinuSwapQuoter.sol` |
| [NonfungibleTokenPositionDescriptor](position-descriptor.md) | NFT metadata | `contracts/periphery/NonfungibleTokenPositionDescriptor.sol` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
        exactInput/Output         mint/collect         quoteExact
                    │                    │                    │
                    ▼                    ▼                    ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌──────────────────┐
│      SwapRouter         │ │  NonfungiblePosition    │ │  VinuSwapQuoter  │
│ ┌─────────────────────┐ │ │       Manager           │ │                  │
│ │ PeripheryPayments   │ │ │ ┌─────────────────────┐ │ │ - quoteExact     │
│ │ PeripheryValidation │ │ │ │   ERC721 + Permit   │ │ │   InputSingle    │
│ │ Multicall           │ │ │ │   Position Locking  │ │ │ - quoteExact     │
│ │ SelfPermit          │ │ │ │   LiquidityMgmt     │ │ │   OutputSingle   │
│ └─────────────────────┘ │ │ └─────────────────────┘ │ │                  │
└────────────┬────────────┘ └───────────┬─────────────┘ └────────┬─────────┘
             │                          │                        │
             │          swap()          │       mint()           │ (read-only)
             │                          │                        │
             ▼                          ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VinuSwapPool                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Base Contracts (Mixins)

Periphery contracts inherit from several base contracts:

### PeripheryImmutableState

Stores immutable references to factory and WVC:

```solidity
address public immutable factory;
address public immutable WVC;
```

### PeripheryPayments

Handles token transfers and VC wrapping:

```solidity
function pay(address token, address payer, address recipient, uint256 value)
function unwrapWVC(uint256 amountMinimum, address recipient)
function sweepToken(address token, uint256 amountMinimum, address recipient)
function refundVC()
```

### PeripheryPaymentsWithFee

Extends PeripheryPayments with fee extraction:

```solidity
function unwrapWVCWithFee(uint256 amountMinimum, address recipient, uint256 feeBips, address feeRecipient)
function sweepTokenWithFee(address token, uint256 amountMinimum, address recipient, uint256 feeBips, address feeRecipient)
```

### PeripheryValidation

Provides deadline checking:

```solidity
modifier checkDeadline(uint256 deadline) {
    require(block.timestamp <= deadline, 'Transaction too old');
    _;
}
```

### Multicall

Allows batching multiple calls:

```solidity
function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)
```

### SelfPermit

Enables permit-based approvals:

```solidity
function selfPermit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
function selfPermitIfNecessary(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
function selfPermitAllowed(address token, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)
function selfPermitAllowedIfNecessary(address token, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)
```

### LiquidityManagement

Provides callback handling for minting:

```solidity
function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data)
```

### ERC721Permit

Extends ERC721 with permit functionality for gasless approvals.

## Contract Details

### SwapRouter

The SwapRouter executes swaps through VinuSwap pools.

**Key Features:**
- Single and multi-hop swaps
- Exact input and exact output modes
- Deadline and slippage protection
- VC ↔ WVC handling
- Permit support for gasless approvals

[Full Reference →](swap-router.md)

### NonfungiblePositionManager

Manages liquidity positions as ERC721 NFTs.

**Key Features:**
- Mint, increase, decrease liquidity
- Fee collection
- **Position locking** (VinuSwap extension)
- ERC721 permit support

[Full Reference →](position-manager.md)

### VinuSwapQuoter

Simulates swaps to return expected amounts.

**Key Features:**
- Quote exact input amounts
- Quote exact output amounts
- Returns price after swap
- Estimates gas cost (ticks crossed)

[Full Reference →](quoter.md)

### NonfungibleTokenPositionDescriptor

Generates NFT metadata and SVG visualizations.

**Key Features:**
- On-chain SVG generation
- Token symbol/decimal lookup
- Position visualization

[Full Reference →](position-descriptor.md)

## Common Patterns

### Deadline Protection

All state-changing operations accept a deadline:

```javascript
const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
await router.exactInputSingle({ ...params, deadline });
```

### Slippage Protection

Specify minimum output (exact input) or maximum input (exact output):

```javascript
// Exact input: specify minimum output
await router.exactInputSingle({
    ...params,
    amountIn: parseEther('1'),
    amountOutMinimum: parseEther('0.95') // Accept 5% slippage
});

// Exact output: specify maximum input
await router.exactOutputSingle({
    ...params,
    amountOut: parseEther('1'),
    amountInMaximum: parseEther('1.05') // Pay up to 5% more
});
```

### Multicall Usage

Batch multiple operations:

```javascript
const calls = [
    router.interface.encodeFunctionData('exactInputSingle', [params1]),
    router.interface.encodeFunctionData('exactInputSingle', [params2])
];
await router.multicall(calls);
```

### VC Handling

The periphery contracts handle VC automatically:

```javascript
// Send VC with the transaction
await router.exactInputSingle(
    { ...params, tokenIn: WVC },
    { value: amountIn }
);

// Receive VC from swap
await router.exactInputSingle({
    ...params,
    tokenOut: WVC,
    recipient: ADDRESS_ZERO // Indicates unwrap
});
await router.unwrapWVC(amountOutMinimum, recipientAddress);
```

## VinuSwap Extensions

### Position Locking

The NonfungiblePositionManager adds position locking:

```javascript
// Lock position until timestamp
await positionManager.lock(
    tokenId,
    lockUntil,  // Unix timestamp
    deadline
);

// Locked positions cannot:
// - decreaseLiquidity()
// - burn()

// Locked positions can still:
// - collect() fees
// - increaseLiquidity()
```

## Security Considerations

1. **Deadline**: Always set reasonable deadlines to prevent stale transactions.

2. **Slippage**: Set appropriate minimums/maximums based on market conditions.

3. **Recipient**: Use `address(0)` for ETH unwrapping, actual address for tokens.

4. **Permit Signatures**: Verify permit parameters carefully to prevent replay attacks.

## Next Steps

- [SwapRouter Reference](swap-router.md)
- [NonfungiblePositionManager Reference](position-manager.md)
- [VinuSwapQuoter Reference](quoter.md)
- [Executing Swaps Guide](../../guides/swapping.md)
