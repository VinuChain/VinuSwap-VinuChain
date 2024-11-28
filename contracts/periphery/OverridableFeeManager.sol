// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../core/interfaces/IFeeManager.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @title Overridable Fee Manager
/// @notice Uses a default fee manager, but allows for fee manager overrides on a per-pool basis
contract OverridableFeeManager is IFeeManager, Ownable {
    address public defaultFeeManager;
    mapping(address => address) public feeManagerOverride;
    constructor(address _defaultFeeManager) Ownable() {
        defaultFeeManager = _defaultFeeManager;
    }

    /// @notice Set the default fee manager
    /// @param newDefaultFeeManager The new default fee manager
    function setDefaultFeeManager(address newDefaultFeeManager) external onlyOwner {
        defaultFeeManager = newDefaultFeeManager;
    }

    /// @notice Set the fee manager override for a pool
    /// @param pool The pool to override the fee manager for
    function setFeeManagerOverride(address pool, address newFeeManager) external onlyOwner {
        feeManagerOverride[pool] = newFeeManager;
    }

    /// @inheritdoc IFeeManager
    function computeFee(uint24 fee) external override returns (uint24) {
        if (feeManagerOverride[msg.sender] != address(0)) {
            return IFeeManager(feeManagerOverride[msg.sender]).computeFee(fee);
        }
        return IFeeManager(defaultFeeManager).computeFee(fee);
    }
}