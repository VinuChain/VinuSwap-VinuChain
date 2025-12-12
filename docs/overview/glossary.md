# Glossary

## A

### AMM (Automated Market Maker)
A decentralized exchange mechanism that uses mathematical formulas to price assets instead of an order book. VinuSwap uses concentrated liquidity AMM.

## B

### Burn
1. Destroying tokens permanently by sending to an unrecoverable address
2. Removing liquidity from a position (decreasing liquidity to zero and burning the position NFT)

## C

### Callback
A function called by the pool back to the caller during swap/mint operations. Used to receive tokens after the operation completes.

### Concentrated Liquidity
A mechanism where liquidity providers allocate capital to specific price ranges instead of the entire price curve.

### Controller
VinuSwap's fee collection and distribution contract that manages protocol fees across multiple shareholders.

## D

### Deadline
A timestamp after which a transaction should revert. Prevents execution of stale transactions.

## F

### Factory
The VinuSwapFactory contract responsible for deploying and registering pools.

### Fee Growth
Accumulated fees per unit of liquidity. Tracked globally and per-tick to calculate individual position earnings.

### Fee Manager
A contract implementing `IFeeManager` that can modify swap fees dynamically based on custom logic.

### Fee Protocol
The portion of swap fees directed to the protocol (controlled by factory owner).

### Fee Tier
The swap fee percentage for a pool (e.g., 0.05%, 0.25%, 1%).

## I

### Impermanent Loss
The difference between holding tokens in a liquidity position versus holding them directly, caused by price divergence.

### Initialized Tick
A tick at which a position boundary exists, storing liquidity delta information.

## L

### Liquidity
A measure of the pool's ability to facilitate trades. Higher liquidity = lower price impact.

### Liquidity Delta
The change in liquidity at a tick boundary when positions are entered/exited.

### Lock
VinuSwap's position locking feature that prevents liquidity removal until a specified timestamp.

## M

### Mint
Creating a new liquidity position by depositing tokens into a price range.

### Multicall
A function allowing multiple contract calls to be batched into a single transaction.

## N

### NFT Position
A liquidity position represented as an ERC721 NFT through the NonfungiblePositionManager.

## O

### Observation
A snapshot of cumulative tick and liquidity data used for TWAP calculations.

### Oracle
The built-in price oracle that provides time-weighted average prices (TWAP).

## P

### Periphery
Contracts that interact with core contracts but aren't part of the core protocol (SwapRouter, PositionManager, etc.).

### Pool
A VinuSwapPool contract instance for a specific token pair and fee tier.

### Position
A liquidity provider's stake defined by tick boundaries and liquidity amount.

### Price Impact
The change in price caused by a trade. Larger trades have higher price impact.

## Q

### Q64.96 / Q128.128
Fixed-point number formats. Q64.96 means 64 bits for the integer part, 96 bits for the fractional part.

### Quoter
A contract that simulates swaps to estimate output amounts without executing on-chain.

## R

### Range Order
Using concentrated liquidity as a limit order by providing liquidity in a narrow range.

### Reentrancy
An attack where a malicious contract calls back into the vulnerable contract before the first execution completes.

## S

### Slippage
The difference between expected and actual trade execution price.

### Slot0
The primary state storage slot in a pool containing price, tick, oracle index, and protocol fee settings.

### sqrtPriceX96
The square root of the current price in Q64.96 format. Used for efficient math operations.

### Swap
Trading one token for another through the pool.

## T

### Tick
A discrete price point in the pool. Each tick represents a 0.01% (1 basis point) price change.

### Tick Bitmap
A data structure for efficiently finding the next initialized tick.

### Tick Spacing
The minimum distance between initialized ticks. Determines price granularity.

### Tiered Discount
VinuSwap's fee discount system based on token balance thresholds.

### Token0/Token1
The two tokens in a pool, ordered by address (token0 < token1).

### TWAP (Time-Weighted Average Price)
An average price calculated over a time period, resistant to manipulation.

## W

### WVC
Wrapped VC contract that wraps native VC (VinuCoin) as an ERC20 token.

## X

### X96
Suffix indicating a Q64.96 fixed-point number (multiplied by 2^96).

## Z

### Zero for One
A swap direction flag. `true` = swapping token0 for token1, `false` = swapping token1 for token0.
