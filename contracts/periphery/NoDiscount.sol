// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../core/interfaces/IFeeManager.sol';

contract NoDiscount is IFeeManager {
    function computeFee(uint24 fee) external pure override returns (uint24) {
        return fee;
    }
}