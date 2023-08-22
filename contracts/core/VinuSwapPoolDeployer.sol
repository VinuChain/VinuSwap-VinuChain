// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import './interfaces/IVinuSwapPoolDeployer.sol';

import './VinuSwapPool.sol';

contract VinuSwapPoolDeployer is IVinuSwapPoolDeployer {
    address internal _factory;
    address internal _token0;
    address internal _token1;
    uint24 internal _fee;
    int24 internal _tickSpacing;

    function parameters() public view override returns (address factory, address token0, address token1, uint24 fee, int24 tickSpacing, address feeManager) {
        factory = _factory;
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        tickSpacing = _tickSpacing;
    }

    /// @dev Deploys a pool with the given parameters by transiently setting the parameters storage slot and then
    /// clearing it after deploying the pool.
    /// @param factory The contract address of the Uniswap V3 factory
    /// @param token0 The first token of the pool by address sort order
    /// @param token1 The second token of the pool by address sort order
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param tickSpacing The spacing between usable ticks
    function deploy(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) internal returns (address pool) {
        _factory = factory;
        _token0 = token0;
        _token1 = token1;
        _fee = fee;
        _tickSpacing = tickSpacing;
        pool = address(new VinuSwapPool{salt: keccak256(abi.encode(token0, token1, fee))}());
    }
}
