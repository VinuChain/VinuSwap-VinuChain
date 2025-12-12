# CallbackValidation Library

Validates that callbacks originate from legitimate VinuSwap pools.

**Source:** `contracts/periphery/libraries/CallbackValidation.sol`

## Purpose

During swaps and mints, the pool calls back to the caller to receive tokens. This library ensures the callback is from a legitimate pool and not a malicious contract.

## Functions

### verifyCallback

```solidity
function verifyCallback(
    address factory,
    address tokenA,
    address tokenB,
    uint24 fee
) internal view returns (IVinuSwapPool pool)
```

Verifies `msg.sender` is a valid pool deployed by the factory.

**Parameters:**
- `factory` - VinuSwap factory address
- `tokenA` - First token address
- `tokenB` - Second token address
- `fee` - Pool fee tier

**Returns:**
- `pool` - The verified pool contract

**Reverts:** If `msg.sender` is not the expected pool address.

### verifyCallback (PoolKey overload)

```solidity
function verifyCallback(
    address factory,
    PoolAddress.PoolKey memory poolKey
) internal view returns (IVinuSwapPool pool)
```

Same as above but accepts a PoolKey struct.

## Usage

### In SwapRouter

```solidity
function uniswapV3SwapCallback(
    int256 amount0Delta,
    int256 amount1Delta,
    bytes calldata _data
) external override {
    require(amount0Delta > 0 || amount1Delta > 0);

    SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));

    // Verify this callback is from a legitimate pool
    CallbackValidation.verifyCallback(factory, data.poolKey);

    // Safe to proceed - transfer tokens to pool
    if (amount0Delta > 0) {
        pay(data.poolKey.token0, data.payer, msg.sender, uint256(amount0Delta));
    }
    if (amount1Delta > 0) {
        pay(data.poolKey.token1, data.payer, msg.sender, uint256(amount1Delta));
    }
}
```

### In NonfungiblePositionManager

```solidity
function uniswapV3MintCallback(
    uint256 amount0Owed,
    uint256 amount1Owed,
    bytes calldata data
) external override {
    MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));

    // Verify callback
    CallbackValidation.verifyCallback(factory, decoded.poolKey);

    // Transfer tokens
    if (amount0Owed > 0) {
        pay(decoded.poolKey.token0, decoded.payer, msg.sender, amount0Owed);
    }
    if (amount1Owed > 0) {
        pay(decoded.poolKey.token1, decoded.payer, msg.sender, amount1Owed);
    }
}
```

## Security

Without callback validation, an attacker could:

1. Deploy a malicious contract mimicking a pool
2. Call your callback handler
3. Trick you into sending tokens to the attacker

The validation ensures:
- `msg.sender` matches the computed pool address
- The pool was deployed by the legitimate factory

## Implementation

```solidity
library CallbackValidation {
    function verifyCallback(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view returns (IVinuSwapPool pool) {
        pool = IVinuSwapPool(
            PoolAddress.computeAddress(
                factory,
                PoolAddress.getPoolKey(tokenA, tokenB, fee)
            )
        );
        require(msg.sender == address(pool), 'Invalid callback');
    }
}
```

## Related

- [PoolAddress Library](pool-address.md)
- [SwapRouter](../periphery/swap-router.md)
- [NonfungiblePositionManager](../periphery/position-manager.md)
