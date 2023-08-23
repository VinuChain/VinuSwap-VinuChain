// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma abicoder v2;

/// @title Fee Manager
/// @notice Allows computing fees dinamically
interface IFeeManager {
    /// @notice Computes the actual fee pips
    /// @param fee The current fee pips
    /// @return uint24 The actual fee pips
    function computeFee(uint24 fee) external returns (uint24);
}