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
    allowUnlimitedContractSize: true,
    contractSizer: {
        // Run with `npx hardhat size-contracts` on demand instead of every compile.
        runOnCompile: false
    },
    networks: {
        hardhat: {
            // Generating + funding 2000 signers slows hardhat node startup
            // significantly; the default of 20 is enough for the suite. Set
            // HARDHAT_ACCOUNTS_COUNT to override for stress tests.
            accounts: {
                count: parseInt(process.env.HARDHAT_ACCOUNTS_COUNT ?? "20", 10)
            }
        },
        vinu: {
            url: "https://vinuchain-rpc.com",
            accounts: [
            ]
        }
    }
}