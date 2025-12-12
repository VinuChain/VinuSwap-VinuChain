# NonfungibleTokenPositionDescriptor

The NonfungibleTokenPositionDescriptor generates metadata and SVG visualizations for position NFTs.

**Source:** `contracts/periphery/NonfungibleTokenPositionDescriptor.sol`

## Overview

The descriptor:
- Generates on-chain SVG images for position NFTs
- Provides ERC721 `tokenURI` metadata
- Displays position details (tokens, range, liquidity)

## Functions

### tokenURI

```solidity
function tokenURI(
    INonfungiblePositionManager positionManager,
    uint256 tokenId
) external view override returns (string memory)
```

Returns the full URI for a position NFT's metadata.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `positionManager` | `INonfungiblePositionManager` | Position manager contract |
| `tokenId` | `uint256` | NFT token ID |

**Returns:**

A base64-encoded data URI containing JSON metadata:

```json
{
  "name": "VinuSwap - 0.3% - USDT/WVC - 1800<>2200",
  "description": "This NFT represents a liquidity position...",
  "image": "data:image/svg+xml;base64,..."
}
```

## Generated SVG

The SVG visualization includes:

- **Token symbols** - Both tokens in the pair
- **Fee tier** - Pool fee percentage
- **Price range** - Lower and upper tick prices
- **Position ID** - Token ID
- **Pool address** - Contract address

### Example SVG Elements

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 290 500">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="290" height="500" fill="url(#bg)" rx="20"/>

  <!-- Token symbols -->
  <text x="145" y="50" text-anchor="middle" fill="#fff" font-size="24">
    USDT/WVC
  </text>

  <!-- Fee tier -->
  <text x="145" y="80" text-anchor="middle" fill="#888" font-size="14">
    0.30%
  </text>

  <!-- Price range visualization -->
  <rect x="30" y="120" width="230" height="20" fill="#333" rx="5"/>
  <rect x="80" y="120" width="100" height="20" fill="#4CAF50" rx="5"/>

  <!-- Range values -->
  <text x="30" y="160" fill="#fff" font-size="12">
    Min: 1,800 USDT/WVC
  </text>
  <text x="30" y="180" fill="#fff" font-size="12">
    Max: 2,200 USDT/WVC
  </text>

  <!-- Token ID -->
  <text x="145" y="450" text-anchor="middle" fill="#888" font-size="10">
    ID: 12345
  </text>
</svg>
```

## Dependencies

### NFTDescriptor Library

The descriptor uses the `NFTDescriptor` library for SVG generation:

```solidity
import './libraries/NFTDescriptor.sol';

function tokenURI(...) external view returns (string memory) {
    return NFTDescriptor.constructTokenURI(
        NFTDescriptor.ConstructTokenURIParams({
            tokenId: tokenId,
            quoteTokenAddress: token0,
            baseTokenAddress: token1,
            quoteTokenSymbol: symbol0,
            baseTokenSymbol: symbol1,
            quoteTokenDecimals: decimals0,
            baseTokenDecimals: decimals1,
            flipRatio: flipRatio,
            tickLower: tickLower,
            tickUpper: tickUpper,
            tickCurrent: tickCurrent,
            tickSpacing: tickSpacing,
            fee: fee,
            poolAddress: poolAddress
        })
    );
}
```

### NFTSVG Library

Lower-level SVG construction:

```solidity
import './libraries/NFTSVG.sol';

// Generates SVG paths, gradients, and text elements
```

## Token Symbol Resolution

The descriptor attempts to resolve token symbols:

1. Calls `symbol()` on the token contract
2. Falls back to address truncation if call fails
3. Uses WVC native symbol for wrapped VC

```solidity
function tokenSymbol(address token) private view returns (string memory) {
    if (token == WVC) {
        return nativeCurrencyLabelBytes;  // e.g., "VC"
    }

    // Try to call symbol()
    (bool success, bytes memory data) = token.staticcall(
        abi.encodeWithSelector(IERC20Metadata.symbol.selector)
    );

    if (success && data.length > 0) {
        return abi.decode(data, (string));
    }

    // Fallback to address
    return addressToString(token);
}
```

## Constructor

```solidity
constructor(
    address _WVC,
    bytes32 _nativeCurrencyLabelBytes
)
```

| Parameter | Description |
|-----------|-------------|
| `_WVC` | Wrapped native currency address |
| `_nativeCurrencyLabelBytes` | Native currency symbol (e.g., "VC") |

## Integration

### Position Manager Integration

The NonfungiblePositionManager calls the descriptor:

```solidity
function tokenURI(uint256 tokenId) public view override returns (string memory) {
    require(_exists(tokenId), 'Invalid token ID');
    return INonfungibleTokenPositionDescriptor(tokenDescriptor_)
        .tokenURI(this, tokenId);
}
```

### Marketplace Compatibility

The generated metadata is compatible with:
- OpenSea
- Rarible
- LooksRare
- Other NFT marketplaces supporting ERC721 metadata

## Customization

To customize NFT appearance:

1. Deploy new NFTDescriptor library
2. Deploy new NonfungibleTokenPositionDescriptor
3. Link to position manager (requires redeployment or proxy update)

## Gas Considerations

- `tokenURI` is a view function (no gas for reads)
- SVG generation is computationally intensive
- Large positions with many ticks may hit view function limits

## Interface

```solidity
interface INonfungibleTokenPositionDescriptor {
    function tokenURI(
        INonfungiblePositionManager positionManager,
        uint256 tokenId
    ) external view returns (string memory);
}
```

## Related

- [NonfungiblePositionManager](position-manager.md)
- [NFTDescriptor Library](../libraries/overview.md)
