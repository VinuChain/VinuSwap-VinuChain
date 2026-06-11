// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title Provides functions for deriving a pool address from the factory, tokens, and the fee
library PoolAddress {
    // Local deterministic value for the vendored test periphery; reproduced by a clean
    // `npm ci && npx hardhat compile` at HEAD (solc 0.7.6, runs:1, v3-core 1.0.1).
    // The LIVE mainnet factory (chain 207) pools derive with
    //   0xe8b892178c932bab07f2a26456a3a5e2c79d3301113659dc834ca80e3ea3596e
    // — any periphery deployment against the live factory MUST use that value.
    // See reports runbook vinuswap-init-code-hash.md (audit M-2).
    bytes32 internal constant POOL_INIT_CODE_HASH = 0xabbbd0d15b71abfbaad4b7a124f1070d10b298946137a0f9178c1a8d09b9ea3f;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }

    /// @notice Deterministically computes the pool address given the factory and PoolKey
    /// @param factory The Uniswap V3 factory contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the V3 pool
    function computeAddress(address factory, PoolKey memory key) internal pure returns (address pool) {
        require(key.token0 < key.token1);
        pool = address(
            uint256(
                keccak256(
                    abi.encodePacked(
                        hex'ff',
                        factory,
                        keccak256(abi.encode(key.token0, key.token1, key.fee)),
                        POOL_INIT_CODE_HASH
                    )
                )
            )
        );
    }
}
