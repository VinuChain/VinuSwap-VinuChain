// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '../core/VinuSwapPool.sol';

/// @title Pool Initialization Helper
/// @notice Used to compute on-chain the pool init code hash (used in the factory)
contract PoolInitHelper {
    bytes32 internal constant POOL_INIT_CODE_HASH = keccak256(abi.encodePacked(type(VinuSwapPool).creationCode));

    function getInitCodeHash () external pure returns (bytes32) {
        return POOL_INIT_CODE_HASH;
    }
}