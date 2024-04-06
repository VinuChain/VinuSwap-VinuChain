import { ethers } from "ethers";

import { VinuSwapPool } from "../typechain-types/contracts/core/VinuSwapPool";
import { SwapRouter } from "../typechain-types/contracts/periphery/SwapRouter";
import VinuSwapPoolInfo from "../artifacts/contracts/core/VinuSwapPool.sol/VinuSwapPool.json";
import SwapRouterInfo from "../artifacts/contracts/periphery/SwapRouter.sol/SwapRouter.json";
import { NonfungiblePositionManager } from "../typechain-types/contracts/periphery/NonfungiblePositionManager";
import NonfungiblePositionManagerInfo from "../artifacts/contracts/periphery/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

import { VinuSwapQuoter } from "../typechain-types/contracts/periphery/VinuSwapQuoter";
import VinuSwapQuoterInfo from "../artifacts/contracts/periphery/VinuSwapQuoter.sol/VinuSwapQuoter.json";

import ERC20Abi from "./abi/ERC20.json";

import { encodePrice, decodePrice, withCustomTickSpacing } from "./utils";
import { BigNumber } from "@ethersproject/bignumber";

// @ts-ignore
import { Token } from "@uniswap/sdk-core";
// @ts-ignore
import { Percent } from "@uniswap/sdk-core/dist";
// @ts-ignore
import { TickMath, nearestUsableTick, Position, Pool } from "@uniswap/v3-sdk";
import JSBI from "jsbi";


class VinuSwap {
  public token0: string;
  public token1: string;
  public fee: number;
  public pool: VinuSwapPool;
  public quoter: VinuSwapQuoter;
  public router: SwapRouter;
  public positionManager: NonfungiblePositionManager;
  public token0Contract: ethers.Contract;
  public token1Contract: ethers.Contract;
  public signerOrProvider: ethers.Signer | ethers.providers.Provider;
  public _significantDigits: number = 18;

  private constructor(
    token0: string,
    token1: string,
    fee: number,
    pool: VinuSwapPool,
    quoter: VinuSwapQuoter,
    router: SwapRouter,
    positionManager: NonfungiblePositionManager,
    token0Contract: ethers.Contract,
    token1Contract: ethers.Contract,
    signerOrProvider: ethers.Signer | ethers.providers.Provider
  ) {
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee;
    this.pool = pool;
    this.quoter = quoter;
    this.router = router;
    this.positionManager = positionManager;
    this.token0Contract = token0Contract;
    this.token1Contract = token1Contract;
    this.signerOrProvider = signerOrProvider;
  }

  public connect(signer: ethers.Signer): VinuSwap {
    return new VinuSwap(
      this.token0,
      this.token1,
      this.fee,
      this.pool.connect(signer),
      this.quoter.connect(signer),
      this.router.connect(signer),
      this.positionManager.connect(signer),
      this.token0Contract.connect(signer),
      this.token1Contract.connect(signer),
      signer
    );
  }

  public static async create(
    tokenA: string,
    tokenB: string,
    fee: number,
    poolAddress: string,
    quoterAddress: string,
    routerAddress: string,
    positionManagerAddress: string,
    signerOrProvider: ethers.providers.Provider | ethers.Signer
  ): Promise<VinuSwap> {
    const router = new ethers.Contract(
      routerAddress,
      SwapRouterInfo.abi,
      signerOrProvider
    ) as SwapRouter;

    const pool = new ethers.Contract(
      poolAddress,
      VinuSwapPoolInfo.abi,
      signerOrProvider
    ) as VinuSwapPool;

    const quoter = new ethers.Contract(
      quoterAddress,
      VinuSwapQuoterInfo.abi,
      signerOrProvider
    ) as VinuSwapQuoter;

    const token0Address = await pool.token0();
    const token1Address = await pool.token1();

    if (tokenA != token0Address && tokenA != token1Address) {
      throw new Error("TokenA address does not match");
    }
    if (tokenB != token0Address && tokenB != token1Address) {
      throw new Error("TokenB address does not match");
    }

    const poolFee = await pool.fee();

    if (fee != poolFee) {
      throw new Error("Fee does not match");
    }

    const positionManager = new ethers.Contract(
      positionManagerAddress,
      NonfungiblePositionManagerInfo.abi,
      signerOrProvider
    ) as NonfungiblePositionManager;

    const token0Contract = new ethers.Contract(
      token0Address,
      ERC20Abi,
      signerOrProvider
    );
    const token1Contract = new ethers.Contract(
      token1Address,
      ERC20Abi,
      signerOrProvider
    );

    return new VinuSwap(
      token0Address,
      token1Address,
      poolFee,
      pool,
      quoter,
      router,
      positionManager,
      token0Contract,
      token1Contract,
      signerOrProvider
    );
  }

  public async unlocked(): Promise<boolean> {
    return (await this.pool.slot0()).unlocked;
  }

  public async factory(): Promise<string> {
    return this.pool.factory();
  }

  public async protocolShare0(): Promise<number> {
    return 1 / ((await this.pool.slot0()).feeProtocol % 16);
  }

  public async protocolShare1(): Promise<number> {
    return 1 / ((await this.pool.slot0()).feeProtocol >> 4);
  }

  public async balance0(): Promise<string> {
    return this.token0Contract.balanceOf(this.pool.address);
  }

  public async balance1(): Promise<string> {
    return this.token1Contract.balanceOf(this.pool.address);
  }

  public async price(): Promise<string> {
    return decodePrice((await this.pool.slot0()).sqrtPriceX96);
  }

  public async availableProtocolFees(): Promise<[ethers.BigNumber, ethers.BigNumber]> {
    const protocolFees = await this.pool.protocolFees();
    return [protocolFees.token0, protocolFees.token1];
  }

  protected async asUniswapPool(): Promise<Pool> {
    const slot0 = await this.pool.slot0();
    const token0Decimals = await this.token0Contract.decimals();
    const token1Decimals = await this.token1Contract.decimals();
    const chainId = 0; // We actually don't care about this
    // We could also retrieve the true token names from the contracts,
    // but it's unnecessary and slows down the process
    return new Pool(
      new Token(chainId, this.token0, token0Decimals, "Token0"),
      new Token(chainId, this.token1, token1Decimals, "Token1"),
      this.fee,
      slot0.sqrtPriceX96.toString(),
      (await this.pool.liquidity()).toString(),
      slot0.tick
    );
  }

  public async positionOperator(nftId: string): Promise<string> {
    return (await this.positionManager.positions(nftId)).operator;
  }

  public async positionPriceBounds(nftId: string): Promise<[string, string]> {
    return await withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
        const position = new Position({
            pool: await this.asUniswapPool(),
            liquidity: (await this.positionManager.positions(nftId)).liquidity.toString(),
            tickLower: (await this.positionManager.positions(nftId)).tickLower,
            tickUpper: (await this.positionManager.positions(nftId)).tickUpper
        });

        return [position.token0PriceLower.toSignificant(this._significantDigits), position.token0PriceUpper.toSignificant(this._significantDigits)];
    });
  }

  public async positionAmount0(nftId: string): Promise<string> {
    return await withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
        const position = new Position({
            pool: await this.asUniswapPool(),
            liquidity: (await this.positionManager.positions(nftId)).liquidity.toString(),
            tickLower: (await this.positionManager.positions(nftId)).tickLower,
            tickUpper: (await this.positionManager.positions(nftId)).tickUpper
        });

        return position.amount0.numerator.toString();
    });
  }

  public async positionAmount1(nftId: string): Promise<string> {
    return await withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
        const position = new Position({
            pool: await this.asUniswapPool(),
            liquidity: (await this.positionManager.positions(nftId)).liquidity.toString(),
            tickLower: (await this.positionManager.positions(nftId)).tickLower,
            tickUpper: (await this.positionManager.positions(nftId)).tickUpper
        });

        return position.amount1.numerator.toString();
    });
  }

  public async positionLiquidity(nftId: string): Promise<BigNumber> {
    return (await this.positionManager.positions(nftId)).liquidity;
  }

  public async positionLockedUntil(nftId: string): Promise<Date> {
    return new Date(
      parseInt(
        (await this.positionManager.positions(nftId)).lockedUntil.toString()
      ) * 1000
    );
  }

  public async positionIsLocked(nftId: string): Promise<boolean> {
    return (
      parseInt(
        (await this.positionManager.positions(nftId)).lockedUntil.toString()
      ) *
        1000 >
      Date.now()
    );
  }

  public async positionTokenURI(nftId: string): Promise<string> {
    return this.positionManager.tokenURI(nftId);
  }

  public async positionTokensOwed(nftId: string): Promise<[BigNumber, BigNumber]> {
    return await this.positionManager.callStatic.quoteTokensOwed(nftId);
  }

  public async positionOwner(nftId: string): Promise<string> {
    return (await this.positionManager.ownerOf(nftId));
  }

  public async mint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: string,
    amount1Desired: string,
    slippageRatio: number,
    recipient: string,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    const sqrtRatioX96Lower = encodePrice(ratioLower.toString());
    const sqrtRatioX96Upper = encodePrice(ratioUpper.toString());

    let tickLower = TickMath.getTickAtSqrtRatio(
      JSBI.BigInt(sqrtRatioX96Lower.toString())
    );
    let tickUpper = TickMath.getTickAtSqrtRatio(
      JSBI.BigInt(sqrtRatioX96Upper.toString())
    );

    const tickSpacing = await this.pool.tickSpacing();

    tickLower = nearestUsableTick(tickLower, tickSpacing);
    tickUpper = nearestUsableTick(tickUpper, tickSpacing);

    if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) {
      throw new Error("Invalid tick range");
    }

    let slippageBounds: any;

    await withCustomTickSpacing(this.fee, tickSpacing, async () => {
      const pool = await this.asUniswapPool();

      const position = Position.fromAmounts({
        pool,
        tickLower,
        tickUpper,
        amount0: amount0Desired,
        amount1: amount1Desired,
        useFullPrecision: true,
      });

      slippageBounds = position.mintAmountsWithSlippage(
        new Percent(Math.floor(slippageRatio * 10_000), 10_000)
      );
    });

    const tx = await this.positionManager.mint(
      {
        token0: this.token0,
        token1: this.token1,
        fee: this.fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min: slippageBounds.amount0.toString(),
        amount1Min: slippageBounds.amount1.toString(),
        recipient,
        deadline: Math.ceil(deadline.getTime() / 1000),
      }
      //{ gasLimit: 1000000 }
    );
    return tx;
  }

  public async quoteMint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: string,
    amount1Desired: string
  ): Promise<[string, string]> {
    return await withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
      const sqrtRatioX96Lower = encodePrice(ratioLower.toString());
      const sqrtRatioX96Upper = encodePrice(ratioUpper.toString());

      let tickLower = TickMath.getTickAtSqrtRatio(
        JSBI.BigInt(sqrtRatioX96Lower.toString())
      );
      let tickUpper = TickMath.getTickAtSqrtRatio(
        JSBI.BigInt(sqrtRatioX96Upper.toString())
      );

      const tickSpacing = await this.pool.tickSpacing();

      tickLower = nearestUsableTick(tickLower, tickSpacing);
      tickUpper = nearestUsableTick(tickUpper, tickSpacing);

      if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) {
        throw new Error("Invalid tick range");
      }

      const pool = await this.asUniswapPool();

      const position = Position.fromAmounts({
        pool,
        tickLower,
        tickUpper,
        amount0: amount0Desired,
        amount1: amount1Desired,
        useFullPrecision: true,
      });

      return [position.amount0.numerator.toString(), position.amount1.numerator.toString()];
    });
  }

  public async quoteExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ) {
    if (tokenIn != this.token0 && tokenIn != this.token1) {
      throw new Error("TokenIn address does not match");
    }
    if (tokenOut != this.token0 && tokenOut != this.token1) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const quote = await this.quoter.callStatic.quoteExactInputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: this.fee,
      amountIn,
      sqrtPriceLimitX96: 0
    })

    console.log('Obtained exact input quote: ', quote.amountOut.toString())

    return quote.amountOut.toString()
  }

  public async swapExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMinimum: string,
    recipient: string,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    if (tokenIn != this.token0 && tokenIn != this.token1) {
      throw new Error("TokenIn address does not match");
    }
    if (tokenOut != this.token0 && tokenOut != this.token1) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const tx = await this.router.exactInputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: this.fee,
      amountIn,
      amountOutMinimum,
      recipient,
      deadline: Math.ceil(deadline.getTime() / 1000),
      sqrtPriceLimitX96: 0, // We don't use this, since amountOutMinimum is enough for slippage management
    });
    return tx;
  }

  public async quoteExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: string
  ) {
    if (tokenIn != this.token0 && tokenIn != this.token1) {
      throw new Error("TokenIn address does not match");
    }
    if (tokenOut != this.token0 && tokenOut != this.token1) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const quote = await this.quoter.callStatic.quoteExactOutputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: this.fee,
      amount: amountOut, // Note that the nomenclature is different here compared to quoteExactInput
      sqrtPriceLimitX96: 0
    })

    return quote.amountIn.toString()
  }

  public async swapExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: string,
    amountInMaximum: string,
    recipient: string,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    if (tokenIn != this.token0 && tokenIn != this.token1) {
      throw new Error("TokenIn address does not match");
    }
    if (tokenOut != this.token0 && tokenOut != this.token1) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    let tx = await this.router.exactOutputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: this.fee,
      amountOut,
      amountInMaximum,
      recipient,
      deadline: Math.ceil(deadline.getTime() / 1000),
      sqrtPriceLimitX96: 0, // We don't use this, since amountInMaximum is enough for slippage management
    });
    return tx;
  }

  public async burn(): Promise<string> {
    return "0";
  }

  public async collect(nftId: string, recipient: string, amount0Max: string, amount1Max: string): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.collect({
      tokenId: nftId,
      recipient,
      amount0Max,
      amount1Max
    })

    return tx
  }

  public async collectProtocol(recipient: string, amount0Requested: string, amount1Requested: string): Promise<ethers.ContractTransaction> {
    const tx = await this.pool.collectProtocol(
      recipient,
      amount0Requested,
      amount1Requested
    )

    return tx
  }

  public async increaseLiquidity(nftId: string, amount0Desired: string, amount1Desired: string, amount0Min: string, amount1Min: string, deadline: Date): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.increaseLiquidity({
      tokenId: nftId,
      amount0Desired,
      amount1Desired,
      amount0Min,
      amount1Min,
      deadline: Math.ceil(deadline.getTime() / 1000)
    })

    return tx
  }

  public async quoteIncreaseLiquidity(nftId: string, amount0Desired: string, amount1Desired: string): Promise<[string, string]> {
    return withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
      const oldPositionRaw = await this.positionManager.positions(nftId);
      const oldPosition = new Position({
        pool: await this.asUniswapPool(),
        liquidity: oldPositionRaw.liquidity.toString(),
        tickLower: oldPositionRaw.tickLower,
        tickUpper: oldPositionRaw.tickUpper
      });

      const amount0 = oldPosition.amount0.numerator.toString();
      const amount1 = oldPosition.amount1.numerator.toString();

      const newPosition = Position.fromAmounts({
        pool: await this.asUniswapPool(),
        tickLower: oldPositionRaw.tickLower,
        tickUpper: oldPositionRaw.tickUpper,
        amount0: BigNumber.from(amount0).add(BigNumber.from(amount0Desired)).toString(),
        amount1: BigNumber.from(amount1).add(BigNumber.from(amount1Desired)).toString(),
        useFullPrecision: true
      });

      return [newPosition.amount0.subtract(oldPosition.amount0).numerator.toString(), newPosition.amount1.subtract(oldPosition.amount1).numerator.toString()];
    });
  }

  public async decreaseLiquidity(nftId: string, liquidity: string, amount0Min: string, amount1Min: string, deadline: Date): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.decreaseLiquidity({
      tokenId: nftId,
      liquidity,
      amount0Min,
      amount1Min,
      deadline: Math.ceil(deadline.getTime() / 1000)
    })

    return tx
  }

  public async quoteDecreaseLiquidity(nftId: string, liquidity: string): Promise<[string, string]> {
    return withCustomTickSpacing(this.fee, await this.pool.tickSpacing(), async () => {
      const oldPositionRaw = await this.positionManager.positions(nftId);
      const oldPosition = new Position({
        pool: await this.asUniswapPool(),
        liquidity: oldPositionRaw.liquidity.toString(),
        tickLower: oldPositionRaw.tickLower,
        tickUpper: oldPositionRaw.tickUpper
      });

      const newPosition = new Position( {
        pool: await this.asUniswapPool(),
        liquidity: oldPositionRaw.liquidity.sub(liquidity).toString(),
        tickLower: oldPositionRaw.tickLower,
        tickUpper: oldPositionRaw.tickUpper
      });

      return [oldPosition.amount0.subtract(newPosition.amount0).numerator.toString(), oldPosition.amount1.subtract(newPosition.amount1).numerator.toString()];
    });
  }

  public async lock(nftId: string, lockedUntil: Date, deadline: Date): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.lock(nftId, Math.floor(lockedUntil.getTime() / 1000), Math.ceil(deadline.getTime() / 1000));
    return tx;
  }
}

export default VinuSwap;
