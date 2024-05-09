require("@nomiclabs/hardhat-ethers")
require('solidity-docgen');
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers"
import "hardhat-tracer"
import "@nomicfoundation/hardhat-toolbox"

import "hardhat-contract-sizer"

export default{
    defaultNetwork: "hardhat",
    solidity: {
        compilers: [
            {
                version: "0.7.6",
                sourcesDir: '@uniswap/v3-core/contracts',
                settings: {
                    optimizer: {
                    enabled: true,
                    runs: 200,
                    details: { yul: false },
                    },
                }
            },
            {
                version: "0.4.18",
                sourcesDir: '@uniswap/v3-core/contracts',
                settings: {
                    optimizer: {
                    enabled: true,
                    runs: 200,
                    details: { yul: false },
                    },
                }
            }
        ],
        overrides: {
            "contracts/periphery/NonfungiblePositionManager.sol": {
                version: "0.7.6",
                settings: {
                    optimizer: {
                    enabled: true,
                    runs: 1,
                    details: { yul: false },
                    },
                }
            },
            "contracts/core/VinuSwapFactory.sol": {
                version: "0.7.6",
                settings: {
                    optimizer: {
                    enabled: true,
                    runs: 1,
                    details: { yul: false },
                    },
                }
            },
            "contracts/extra/PoolInitHelper.sol": {
                version: "0.7.6",
                settings: {
                    optimizer: {
                    enabled: true,
                    runs: 1,
                    details: { yul: false },
                    },
                }
            }
        }
        
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    allowUnlimitedContractSize: true,
    contractSizer: {
        runOnCompile: true
    },
    networks: {
        hardhat: {
            accounts: {
                count: 2000
            }
        },
        vinu: {
            url: "https://vinuchain-rpc.com",
            accounts: [
            ]
        }
    }
}