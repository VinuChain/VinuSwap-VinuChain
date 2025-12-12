# Libraries Overview

VinuSwap includes numerous helper libraries for common operations.

## Core Libraries

These libraries are used within the core pool contract.

| Library | Purpose |
|---------|---------|
| `TickMath` | Tick ↔ sqrtPrice conversions |
| `SqrtPriceMath` | Price-related calculations |
| `SwapMath` | Compute swap step amounts |
| `Position` | Position state management |
| `Tick` | Tick state management |
| `TickBitmap` | Efficient tick lookup |
| `Oracle` | TWAP observation management |
| `FullMath` | 512-bit math operations |
| `UnsafeMath` | Gas-optimized math |
| `LowGasSafeMath` | Safe math with low gas |
| `SafeCast` | Safe type conversions |

## Periphery Libraries

| Library | Source | Purpose |
|---------|--------|---------|
| [Path](path.md) | `periphery/libraries/Path.sol` | Multi-hop path encoding |
| [PoolAddress](pool-address.md) | `periphery/libraries/PoolAddress.sol` | Deterministic address computation |
| [LiquidityAmounts](liquidity-amounts.md) | `periphery/libraries/LiquidityAmounts.sol` | Token ↔ liquidity calculations |
| [OracleLibrary](oracle-library.md) | `periphery/libraries/OracleLibrary.sol` | TWAP helpers |
| [CallbackValidation](callback-validation.md) | `periphery/libraries/CallbackValidation.sol` | Callback security |
| `PositionKey` | `periphery/libraries/PositionKey.sol` | Position storage key derivation |
| `PositionValue` | `periphery/libraries/PositionValue.sol` | Position value calculations |
| `NFTDescriptor` | `periphery/libraries/NFTDescriptor.sol` | NFT metadata generation |
| `NFTSVG` | `periphery/libraries/NFTSVG.sol` | SVG generation utilities |
| `TransferHelper` | `periphery/libraries/TransferHelper.sol` | Safe token transfers |
| `BytesLib` | `periphery/libraries/BytesLib.sol` | Byte array utilities |
| `HexStrings` | `periphery/libraries/HexStrings.sol` | Hex string conversion |
| `ChainId` | `periphery/libraries/ChainId.sol` | Chain ID helpers |
| `SqrtPriceMathPartial` | `periphery/libraries/SqrtPriceMathPartial.sol` | Partial price math |
| `TokenRatioSortOrder` | `periphery/libraries/TokenRatioSortOrder.sol` | Token ordering |

## VinuSwap Custom Libraries

| Library | Source | Purpose |
|---------|--------|---------|
| `VinuSwapPoolTicksCounter` | `periphery/libraries/VinuSwapPoolTicksCounter.sol` | Enhanced tick counting |

## Usage Examples

### Path Library

```solidity
import './libraries/Path.sol';

// Check if path has multiple pools
bool hasMultiple = Path.hasMultiplePools(path);

// Decode first pool
(address tokenA, address tokenB, uint24 fee) = Path.decodeFirstPool(path);

// Skip to next pool in path
bytes memory remaining = Path.skipToken(path);
```

### PoolAddress Library

```solidity
import './libraries/PoolAddress.sol';

// Compute pool address
address pool = PoolAddress.computeAddress(
    factory,
    PoolAddress.getPoolKey(tokenA, tokenB, fee)
);
```

### LiquidityAmounts Library

```solidity
import './libraries/LiquidityAmounts.sol';

// Get liquidity from token amounts
uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
    sqrtPriceX96,
    sqrtRatioAX96,
    sqrtRatioBX96,
    amount0,
    amount1
);

// Get amounts from liquidity
(uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
    sqrtPriceX96,
    sqrtRatioAX96,
    sqrtRatioBX96,
    liquidity
);
```

### CallbackValidation Library

```solidity
import './libraries/CallbackValidation.sol';

function uniswapV3SwapCallback(...) external {
    // Verify caller is a legitimate pool
    CallbackValidation.verifyCallback(factory, tokenA, tokenB, fee);
    // ...
}
```

### TransferHelper Library

```solidity
import './libraries/TransferHelper.sol';

// Safe transfer (handles non-standard ERC20s)
TransferHelper.safeTransfer(token, recipient, amount);

// Safe transferFrom
TransferHelper.safeTransferFrom(token, from, to, amount);

// Safe approve
TransferHelper.safeApprove(token, spender, amount);

// Safe transfer ETH
TransferHelper.safeTransferETH(recipient, amount);
```

## Related

- [Path Library](path.md)
- [PoolAddress Library](pool-address.md)
- [LiquidityAmounts Library](liquidity-amounts.md)
- [OracleLibrary](oracle-library.md)
