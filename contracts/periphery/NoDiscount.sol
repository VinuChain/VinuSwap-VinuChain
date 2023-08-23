// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../core/interfaces/IFeeManager.sol';

/// @title No Discount Fee Manager
/// @notice Simple fee manager that returns the same fee
contract NoDiscount is IFeeManager {
    /// @inheritdoc IFeeManager
    function computeFee(uint24 fee) external pure override returns (uint24) {
        return fee;
    }
}