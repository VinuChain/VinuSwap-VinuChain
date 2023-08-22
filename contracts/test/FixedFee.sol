// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../core/interfaces/IFeeManager.sol';

contract FixedFee is IFeeManager {
    uint24 public feeValue;

    constructor (uint24 _feeValue) {
        feeValue = _feeValue;
    }
    function computeFee(uint24) external view override returns (uint24) {
        return feeValue;
    }
}