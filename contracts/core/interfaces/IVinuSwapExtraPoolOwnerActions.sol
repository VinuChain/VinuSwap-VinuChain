// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.7.0;

interface IVinuSwapExtraPoolOwnerActions {
    /// @notice Sets the initial price for the pool
    /// @dev Price is represented as a sqrt(amountToken1/amountToken0) Q64.96 value
    /// @dev Unlike the original representation, the price can only be called by the factory owner
    /// @param sqrtPriceX96 the initial sqrt price of the pool as a Q64.96
    function initialize(uint160 sqrtPriceX96) external;
}