// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolOwnerActions.sol';

contract MockPool is IUniswapV3PoolOwnerActions {
    address public token0;
    address public token1;

    uint128 public balance0;
    uint128 public balance1;

    uint8 public feeProtocol0;
    uint8 public feeProtocol1;

    constructor (address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function deposit(uint128 amount0, uint128 amount1) external {
        require(IERC20(token0).transferFrom(msg.sender, address(this), amount0));
        require(IERC20(token1).transferFrom(msg.sender, address(this), amount1));
        balance0 += amount0;
        balance1 += amount1;
    }

    function collectProtocol(address recipient, uint128 amount0Requested, uint128 amount1Requested) external override returns (uint128, uint128) {
        uint128 amount0 = amount0Requested > balance0 ? balance0 : amount0Requested;
        uint128 amount1 = amount1Requested > balance1 ? balance1 : amount1Requested;
        balance0 -= amount0;
        balance1 -= amount1;

        require(IERC20(token0).transfer(recipient, amount0));
        require(IERC20(token1).transfer(recipient, amount1));

        // Note that it's not returning the actual amount collected
        // In this sense, it's a "malicious" pool
    }

    function setFeeProtocol(uint8 _feeProtocol0, uint8 _feeProtocol1) external override {
        feeProtocol0 = _feeProtocol0;
        feeProtocol1 = _feeProtocol1;
    }
}