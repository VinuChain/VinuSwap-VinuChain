# Table of Contents

* [Introduction](README.md)

## Overview

* [Core Concepts](overview/concepts.md)
* [Architecture](overview/architecture.md)
* [Glossary](overview/glossary.md)

## Guides

* [Local Environment Setup](guides/local-environment.md)
* [Executing Swaps](guides/swapping.md)
  * [Single Swaps](guides/swapping.md#single-swaps)
  * [Multi-Hop Swaps](guides/swapping.md#multi-hop-swaps)
* [Providing Liquidity](guides/providing-liquidity.md)
  * [Creating Positions](guides/providing-liquidity.md#creating-positions)
  * [Managing Positions](guides/providing-liquidity.md#managing-positions)
  * [Collecting Fees](guides/providing-liquidity.md#collecting-fees)
* [Position Locking](guides/position-locking.md)
* [Fee Discounts](guides/fee-discounts.md)
* [Using the Quoter](guides/quoting.md)
* [Flash Swaps](guides/flash-swaps.md)

## Contract Reference

### Core Contracts

* [Core Overview](reference/core/overview.md)
* [VinuSwapFactory](reference/core/factory.md)
* [VinuSwapPool](reference/core/pool.md)
  * [Pool State](reference/core/pool.md#state-variables)
  * [Actions](reference/core/pool.md#functions)
  * [Events](reference/core/pool.md#events)
* [VinuSwapPoolDeployer](reference/core/deployer.md)

### Periphery Contracts

* [Periphery Overview](reference/periphery/overview.md)
* [SwapRouter](reference/periphery/swap-router.md)
* [NonfungiblePositionManager](reference/periphery/position-manager.md)
  * [Position Struct](reference/periphery/position-manager.md#position-struct)
  * [Minting](reference/periphery/position-manager.md#mint)
  * [Locking](reference/periphery/position-manager.md#lock)
* [VinuSwapQuoter](reference/periphery/quoter.md)
* [NonfungibleTokenPositionDescriptor](reference/periphery/position-descriptor.md)

### Fee Management

* [Fee Management Overview](reference/fees/overview.md)
* [IFeeManager Interface](reference/fees/ifee-manager.md)
* [TieredDiscount](reference/fees/tiered-discount.md)
* [OverridableFeeManager](reference/fees/overridable-fee-manager.md)
* [Controller](reference/fees/controller.md)

### Libraries

* [Libraries Overview](reference/libraries/overview.md)
* [Path](reference/libraries/path.md)
* [PoolAddress](reference/libraries/pool-address.md)
* [LiquidityAmounts](reference/libraries/liquidity-amounts.md)
* [OracleLibrary](reference/libraries/oracle-library.md)
* [CallbackValidation](reference/libraries/callback-validation.md)

### Interfaces

* [Interfaces Overview](reference/interfaces/overview.md)

## SDK

* [SDK Overview](sdk/overview.md)
* [Installation](sdk/installation.md)
* [VinuSwap Class](sdk/vinuswap-class.md)
* [Utilities](sdk/utilities.md)
* [Examples](sdk/examples.md)

## Deployment

* [Deployment Overview](deployment/overview.md)
* [Deploying to VinuChain](deployment/vinuchain.md)
* [Pool Creation](deployment/pool-creation.md)
* [Configuration](deployment/configuration.md)

## Resources

* [Resources Overview](resources/overview.md)
* [Security](resources/security.md)
* [FAQ](resources/faq.md)
