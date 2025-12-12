# Flash Swaps

Flash swaps (flash loans) allow borrowing tokens from VinuSwap pools without upfront collateral, provided they're returned in the same transaction.

## Overview

Flash swaps enable:
- Arbitrage without capital
- Collateral swaps
- Liquidations
- Self-liquidation

## How It Works

1. Call `pool.flash()` specifying amounts to borrow
2. Pool transfers tokens to your contract
3. Pool calls your `vinuSwapFlashCallback()`
4. You execute your logic
5. Return borrowed amounts + fees
6. Transaction completes (or reverts if not repaid)

## Basic Flash Swap

### Flash Callback Interface

```solidity
interface IVinuSwapFlashCallback {
    function vinuSwapFlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
}
```

### Simple Flash Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import './interfaces/IVinuSwapPool.sol';
import './interfaces/IVinuSwapFlashCallback.sol';
import './interfaces/IERC20.sol';

contract SimpleFlash is IVinuSwapFlashCallback {
    IVinuSwapPool public pool;
    address public token0;
    address public token1;

    constructor(address _pool) {
        pool = IVinuSwapPool(_pool);
        token0 = pool.token0();
        token1 = pool.token1();
    }

    function executeFlash(
        uint256 amount0,
        uint256 amount1,
        bytes calldata userData
    ) external {
        pool.flash(
            address(this),  // recipient
            amount0,        // amount of token0 to borrow
            amount1,        // amount of token1 to borrow
            userData        // passed to callback
        );
    }

    function vinuSwapFlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pool), 'Not pool');

        // Your logic here
        // You have token0 and token1 available

        // Calculate repayment amounts
        uint256 repay0 = IERC20(token0).balanceOf(address(this));
        uint256 repay1 = IERC20(token1).balanceOf(address(this));

        // Ensure we have enough (including fees)
        // fee0 and fee1 are the fees owed

        // Repay the pool
        if (repay0 > 0) {
            IERC20(token0).transfer(address(pool), repay0);
        }
        if (repay1 > 0) {
            IERC20(token1).transfer(address(pool), repay1);
        }
    }
}
```

## Arbitrage Example

### Cross-DEX Arbitrage

```solidity
contract FlashArbitrage is IVinuSwapFlashCallback {
    IVinuSwapPool public vinuPool;
    IUniswapV2Router public otherDex;

    struct ArbitrageParams {
        address tokenBorrow;
        uint256 borrowAmount;
        address tokenProfit;
        uint256 minProfit;
    }

    function executeArbitrage(ArbitrageParams calldata params) external {
        // Determine which token is token0/token1
        bool borrowToken0 = params.tokenBorrow == vinuPool.token0();

        pool.flash(
            address(this),
            borrowToken0 ? params.borrowAmount : 0,
            borrowToken0 ? 0 : params.borrowAmount,
            abi.encode(params)
        );
    }

    function vinuSwapFlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(vinuPool), 'Not pool');

        ArbitrageParams memory params = abi.decode(data, (ArbitrageParams));

        // Step 1: Sell borrowed tokens on other DEX
        IERC20(params.tokenBorrow).approve(
            address(otherDex),
            params.borrowAmount
        );

        address[] memory path = new address[](2);
        path[0] = params.tokenBorrow;
        path[1] = params.tokenProfit;

        uint256[] memory amounts = otherDex.swapExactTokensForTokens(
            params.borrowAmount,
            0,
            path,
            address(this),
            block.timestamp
        );

        uint256 receivedAmount = amounts[1];

        // Step 2: Calculate profit and repayment
        uint256 fee = fee0 > 0 ? fee0 : fee1;
        uint256 repayAmount = params.borrowAmount + fee;

        // If tokenBorrow != tokenProfit, need to swap back
        // This example assumes we borrowed token A, sold for token B,
        // and need to repay token A

        // For simplicity, assuming we already have token A to repay
        // In practice, you'd swap some of tokenProfit back

        // Step 3: Repay flash loan
        IERC20(params.tokenBorrow).transfer(address(vinuPool), repayAmount);

        // Step 4: Take profit
        uint256 profit = IERC20(params.tokenProfit).balanceOf(address(this));
        require(profit >= params.minProfit, 'Insufficient profit');

        IERC20(params.tokenProfit).transfer(msg.sender, profit);
    }
}
```

## Collateral Swap Example

### Swap Collateral Without Closing Position

```solidity
contract CollateralSwap is IVinuSwapFlashCallback {
    ILendingProtocol public lendingProtocol;
    IVinuSwapPool public pool;

    function swapCollateral(
        uint256 collateralAmount,
        address newCollateral,
        uint256 minReceived
    ) external {
        // Flash borrow the new collateral
        bool borrowToken0 = newCollateral == pool.token0();

        pool.flash(
            address(this),
            borrowToken0 ? collateralAmount : 0,
            borrowToken0 ? 0 : collateralAmount,
            abi.encode(msg.sender, collateralAmount, newCollateral, minReceived)
        );
    }

    function vinuSwapFlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pool), 'Not pool');

        (
            address user,
            uint256 amount,
            address newCollateral,
            uint256 minReceived
        ) = abi.decode(data, (address, uint256, address, uint256));

        address oldCollateral = newCollateral == pool.token0()
            ? pool.token1()
            : pool.token0();

        // Step 1: Deposit new collateral for user
        IERC20(newCollateral).approve(address(lendingProtocol), amount);
        lendingProtocol.depositCollateral(user, newCollateral, amount);

        // Step 2: Withdraw old collateral
        uint256 withdrawn = lendingProtocol.withdrawCollateral(
            user,
            oldCollateral,
            amount
        );

        require(withdrawn >= minReceived, 'Slippage');

        // Step 3: Repay flash loan with withdrawn collateral
        uint256 fee = fee0 > 0 ? fee0 : fee1;
        IERC20(oldCollateral).transfer(address(pool), amount + fee);

        // Any excess goes back to user
        uint256 excess = IERC20(oldCollateral).balanceOf(address(this));
        if (excess > 0) {
            IERC20(oldCollateral).transfer(user, excess);
        }
    }
}
```

## Fee Calculation

Flash loan fees are calculated as:

```
fee = amount * pool.fee / 1_000_000
```

For a 0.3% fee pool:
```
fee = amount * 3000 / 1_000_000 = amount * 0.003
```

### Calculate Fee in JS

```javascript
function calculateFlashFee(amount, poolFee) {
    return amount.mul(poolFee).div(1000000);
}

// Example: Borrow 100 ETH from 0.3% pool
const borrowAmount = ethers.utils.parseEther('100');
const poolFee = 3000;
const fee = calculateFlashFee(borrowAmount, poolFee);
// fee = 0.3 ETH
```

## Testing Flash Swaps

### Hardhat Test

```javascript
describe('Flash Swap', function () {
    it('should execute flash arbitrage', async function () {
        // Deploy flash contract
        const Flash = await ethers.getContractFactory('FlashArbitrage');
        const flash = await Flash.deploy(pool.address, otherDex.address);

        // Create price discrepancy on other DEX
        // (setup code...)

        // Execute arbitrage
        const params = {
            tokenBorrow: weth.address,
            borrowAmount: ethers.utils.parseEther('10'),
            tokenProfit: usdc.address,
            minProfit: ethers.utils.parseUnits('50', 6)
        };

        const balanceBefore = await usdc.balanceOf(user.address);
        await flash.executeArbitrage(params);
        const balanceAfter = await usdc.balanceOf(user.address);

        expect(balanceAfter.sub(balanceBefore)).to.be.gt(params.minProfit);
    });

    it('should revert if not repaid', async function () {
        const BadFlash = await ethers.getContractFactory('BadFlash');
        const badFlash = await BadFlash.deploy(pool.address);

        await expect(
            badFlash.executeFlash(ethers.utils.parseEther('1'), 0, '0x')
        ).to.be.revertedWith('F0'); // Flash loan not repaid
    });
});
```

## Security Considerations

### 1. Callback Validation

Always verify the callback is from the expected pool:

```solidity
function vinuSwapFlashCallback(...) external {
    require(msg.sender == address(pool), 'Not pool');
    // ...
}
```

### 2. Reentrancy Protection

Use reentrancy guards for complex logic:

```solidity
bool private locked;

modifier nonReentrant() {
    require(!locked, 'Reentrant');
    locked = true;
    _;
    locked = false;
}

function executeFlash(...) external nonReentrant {
    // ...
}
```

### 3. Slippage Protection

Always check minimum amounts:

```solidity
require(profit >= minProfit, 'Insufficient profit');
```

### 4. Front-Running

Consider that your arbitrage may be front-run. Use private mempools or MEV protection where available.

## Gas Optimization

Flash swaps are expensive. Optimize by:

1. **Minimize storage reads/writes**
2. **Use memory over storage**
3. **Batch operations**
4. **Calculate exact amounts off-chain**

```solidity
// Less gas: pass exact amounts
function executeFlash(
    uint256 amount0,
    uint256 amount1,
    uint256 expectedProfit  // Pre-calculated
) external {
    // ...
}
```

## Related

- [VinuSwapPool Reference](../reference/core/pool.md)
- [PairFlash Example](../reference/periphery/overview.md)
