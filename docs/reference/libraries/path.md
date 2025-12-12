# Path Library

Functions for encoding and decoding multi-hop swap paths.

**Source:** `contracts/periphery/libraries/Path.sol`

## Path Format

Paths encode token addresses and fee tiers as packed bytes:

```
[token0][fee0][token1][fee1][token2]...
  20       3     20      3     20    bytes
```

## Functions

### hasMultiplePools

```solidity
function hasMultiplePools(bytes memory path) internal pure returns (bool)
```

Returns true if the path contains more than one pool (multi-hop).

### numPools

```solidity
function numPools(bytes memory path) internal pure returns (uint256)
```

Returns the number of pools in the path.

### decodeFirstPool

```solidity
function decodeFirstPool(bytes memory path)
    internal
    pure
    returns (address tokenA, address tokenB, uint24 fee)
```

Decodes the first pool's tokens and fee from the path.

### getFirstPool

```solidity
function getFirstPool(bytes memory path) internal pure returns (bytes memory)
```

Returns the first pool's encoded bytes.

### skipToken

```solidity
function skipToken(bytes memory path) internal pure returns (bytes memory)
```

Skips the first token in the path, returning the remaining path.

## JavaScript Implementation

```javascript
function encodePath(tokens, fees) {
    if (tokens.length !== fees.length + 1) {
        throw new Error('Invalid path lengths');
    }

    let path = '0x';
    for (let i = 0; i < fees.length; i++) {
        // Token address (20 bytes)
        path += tokens[i].slice(2).toLowerCase();
        // Fee (3 bytes = 24 bits)
        path += fees[i].toString(16).padStart(6, '0');
    }
    // Final token
    path += tokens[tokens.length - 1].slice(2).toLowerCase();

    return path;
}

function decodePath(path) {
    const tokens = [];
    const fees = [];

    // Remove 0x prefix
    let data = path.slice(2);

    while (data.length > 0) {
        // Token (20 bytes = 40 hex chars)
        tokens.push('0x' + data.slice(0, 40));
        data = data.slice(40);

        if (data.length > 0) {
            // Fee (3 bytes = 6 hex chars)
            fees.push(parseInt(data.slice(0, 6), 16));
            data = data.slice(6);
        }
    }

    return { tokens, fees };
}
```

## Usage Example

```javascript
// Encode: WETH → USDC → DAI
const path = encodePath(
    [WETH, USDC, DAI],
    [3000, 500]  // 0.3%, 0.05%
);
// path = 0x[WETH]000bb8[USDC]0001f4[DAI]

// Decode
const { tokens, fees } = decodePath(path);
// tokens = [WETH, USDC, DAI]
// fees = [3000, 500]
```

## Related

- [SwapRouter](../periphery/swap-router.md)
- [VinuSwapQuoter](../periphery/quoter.md)
