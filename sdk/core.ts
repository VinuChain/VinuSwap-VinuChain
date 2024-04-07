import { ethers, BigNumberish } from "ethers";

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
    pool: VinuSwapPool,
    token0Contract: ethers.Contract,
    token1Contract: ethers.Contract,
    quoter: VinuSwapQuoter,
    router: SwapRouter,
    positionManager: NonfungiblePositionManager,
    signerOrProvider: ethers.Signer | ethers.providers.Provider
  ) {
    this.pool = pool;
    this.quoter = quoter;
    this.router = router;
    this.positionManager = positionManager;
    this.token0Contract = token0Contract;
    this.token1Contract = token1Contract;
    this.signerOrProvider = signerOrProvider;
  }

  /**
   * Connects the signer to the VinuSwap instance
   * @param signer Signer to connect
   * @returns The same VinuSwap instance with the signer connected
   */
  public connect(signer: ethers.Signer): VinuSwap {
    return new VinuSwap(
      this.pool.connect(signer),
      this.token0Contract.connect(signer),
      this.token1Contract.connect(signer),
      this.quoter.connect(signer),
      this.router.connect(signer),
      this.positionManager.connect(signer),
      signer
    );
  }

  /**
   * Creates a new VinuSwap instance.
   * Important: tokenA and tokenB are not necessarily the same as token0 and token1
   * @param tokenA Address of one token
   * @param tokenB Address of the other token
   * @param poolAddress Address of the VinuSwap pool
   * @param quoterAddress Address of the VinuSwap quoter
   * @param routerAddress Address of the VinuSwap router
   * @param positionManagerAddress Address of the VinuSwap position manager
   * @param signerOrProvider Signer or provider to use
   * @returns A new VinuSwap instance
   */
  public static async create(
    tokenA: string,
    tokenB: string,
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
      pool,
      token0Contract,
      token1Contract,
      quoter,
      router,
      positionManager,
      signerOrProvider
    );
  }

  get token0Address(): string {
    return this.token0Contract.address;
  }

  get token1Address(): string {
    return this.token1Contract.address;
  }

  /**
   * Whether the pool is locked.
   */
  public async locked(): Promise<boolean> {
    return !(await this.pool.slot0()).unlocked;
  }

  /**
   * The address of the factory that created the pool.
   */
  public async factory(): Promise<string> {
    return this.pool.factory();
  }

  /**
   * A floating point number representing the share of the token0 protocol fees that go to the protocol.
   */
  public async protocolShare0(): Promise<number> {
    return 1 / ((await this.pool.slot0()).feeProtocol % 16);
  }

  /**
   * A floating point number representing the share of the token1 protocol fees that go to the protocol.
   */
  public async protocolShare1(): Promise<number> {
    return 1 / ((await this.pool.slot0()).feeProtocol >> 4);
  }

  /**
   * The token0 balance of the pool.
   */
  public async balance0(): Promise<BigNumber> {
    return await this.token0Contract.balanceOf(this.pool.address);
  }

  /**
   * The token1 balance of the pool.
   */
  public async balance1(): Promise<BigNumber> {
    return await this.token1Contract.balanceOf(this.pool.address);
  }

  /**
   * The fee of the pool, expressed in bips (0.01%).
   */
  public async poolFee(): Promise<number> {
    return await this.pool.fee();
  }

  /**
   * The ratio between token1 and token0 price.
   */
  public async price(): Promise<string> {
    return decodePrice((await this.pool.slot0()).sqrtPriceX96);
  }

  /**
   * How much fee the protocol has collected.
   */
  public async availableProtocolFees(): Promise<[BigNumber, BigNumber]> {
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
      new Token(chainId, this.token0Contract.address, token0Decimals, "Token0"),
      new Token(chainId, this.token1Contract.address, token1Decimals, "Token1"),
      await this.poolFee(),
      slot0.sqrtPriceX96.toString(),
      (await this.pool.liquidity()).toString(),
      slot0.tick
    );
  }

  /**
   * Retrieves the NFT IDs of all positions owned by a given address.
   * @param owner The address of the owner
   * @returns An array containing the NFT IDs of the positions
   */
  public async positionIdsByOwner(owner: string): Promise<BigNumber[]> {
    const numPositions = await this.positionManager.balanceOf(owner);

    const promises = [];

    for (let i = BigNumber.from(0); i.lt(numPositions); i = i.add(1)) {
      promises.push(this.positionManager.tokenOfOwnerByIndex(owner, i));
    }

    return await Promise.all(promises);
  }

  /**
   * The operator, if any, of a given position.
   * @param nftId The NFT ID of the position
   * @returns The operator address. If no operator is set, returns the zero address
   */
  public async positionOperator(nftId: BigNumberish): Promise<string> {
    return (await this.positionManager.positions(nftId)).operator;
  }

  public async positionPriceBounds(
    nftId: BigNumberish
  ): Promise<[string, string]> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
        const position = new Position({
          pool: await this.asUniswapPool(),
          liquidity: (
            await this.positionManager.positions(nftId)
          ).liquidity.toString(),
          tickLower: (await this.positionManager.positions(nftId)).tickLower,
          tickUpper: (await this.positionManager.positions(nftId)).tickUpper,
        });

        return [
          position.token0PriceLower.toSignificant(this._significantDigits),
          position.token0PriceUpper.toSignificant(this._significantDigits),
        ];
      }
    );
  }

  /**
   * The amount of token0 in a given position.
   * @param nftId The NFT ID of the position
   * @returns The amount of token0
   */
  public async positionAmount0(nftId: BigNumberish): Promise<BigNumber> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
        const position = new Position({
          pool: await this.asUniswapPool(),
          liquidity: (
            await this.positionManager.positions(nftId)
          ).liquidity.toString(),
          tickLower: (await this.positionManager.positions(nftId)).tickLower,
          tickUpper: (await this.positionManager.positions(nftId)).tickUpper,
        });

        return BigNumber.from(position.amount0.numerator.toString());
      }
    );
  }

  /**
   * The amount of token1 in a given position.
   * @param nftId The NFT ID of the position
   * @returns The amount of token1
   */
  public async positionAmount1(nftId: BigNumberish): Promise<BigNumber> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
        const position = new Position({
          pool: await this.asUniswapPool(),
          liquidity: (
            await this.positionManager.positions(nftId)
          ).liquidity.toString(),
          tickLower: (await this.positionManager.positions(nftId)).tickLower,
          tickUpper: (await this.positionManager.positions(nftId)).tickUpper,
        });

        return BigNumber.from(position.amount1.numerator.toString());
      }
    );
  }

  /**
   * The liquidity of a given position. Note: this is an internal number used by VinuSwap,
   * and is not the same as the amount of token0 or token1 in the position.
   * @param nftId The NFT ID of the position
   * @returns The liquidity
   */
  public async positionLiquidity(nftId: BigNumberish): Promise<BigNumber> {
    return (await this.positionManager.positions(nftId)).liquidity;
  }

  /**
   * The date until a given position is locked. If the position is not locked, returns a date in the past.
   * @param nftId The NFT ID of the position
   * @returns The date until the position is locked. If the position has never been locked, returns null.
   */
  public async positionLockedUntil(nftId: BigNumberish): Promise<Date | null> {
    const lockedUntil = (
      await this.positionManager.positions(nftId)
    ).lockedUntil.toString();

    if (lockedUntil == "0") {
      return null;
    }

    return new Date(parseInt(lockedUntil) * 1000);
  }

  /**
   * Whether a given position is locked.
   * @param nftId The NFT ID of the position
   * @returns True if the position is locked, false otherwise
   */
  public async positionIsLocked(nftId: BigNumberish): Promise<boolean> {
    const lockedUntil = await this.positionLockedUntil(nftId);
    return lockedUntil !== null && lockedUntil.getTime() > Date.now();
  }

  /**
   * The tokenURI of a given position.
   * @param nftId The NFT ID of the position
   * @returns The tokenURI
   */
  public async positionTokenURI(nftId: BigNumberish): Promise<string> {
    return this.positionManager.tokenURI(nftId);
  }

  /**
   * The tokens owed to the position owner.
   * @param nftId The NFT ID of the position
   * @returns A tuple containing the amount of token0 and token1 owed to the position owner
   */
  public async positionTokensOwed(
    nftId: BigNumberish
  ): Promise<[BigNumber, BigNumber]> {
    return await this.positionManager.callStatic.quoteTokensOwed(nftId);
  }

  /**
   * The owner of a given position.
   * @param nftId The NFT ID of the position
   * @returns The owner address
   */
  public async positionOwner(nftId: BigNumberish): Promise<string> {
    return await this.positionManager.ownerOf(nftId);
  }

  /**
   * Mint a new position in the pool.
   * @param ratioLower The lowest price ratio at which the position will provide liquidity
   * @param ratioUpper The highest price ratio at which the position will provide liquidity
   * @param amount0Desired How much token0 to provide. Note: this is not the final amount of token0 in the position
   * @param amount1Desired How much token1 to provide. Note: this is not the final amount of token1 in the position
   * @param slippageRatio A number between 0 and 1 representing the maximum slippage ratio
   * @param recipient Who will receive the NFT
   * @param deadline Deadline for the transaction
   * @returns The mint transaction
   */
  public async mint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish,
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

    await withCustomTickSpacing(await this.poolFee(), tickSpacing, async () => {
      const pool = await this.asUniswapPool();

      const position = Position.fromAmounts({
        pool,
        tickLower,
        tickUpper,
        amount0: amount0Desired.toString(),
        amount1: amount1Desired.toString(),
        useFullPrecision: true,
      });

      slippageBounds = position.mintAmountsWithSlippage(
        new Percent(Math.floor(slippageRatio * 10_000), 10_000)
      );
    });

    const tx = await this.positionManager.mint(
      {
        token0: this.token0Contract.address,
        token1: this.token1Contract.address,
        fee: await this.poolFee(),
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

  /**
   * Quote the amount of token0 and token1 that will be minted in a new position.
   * @param ratioLower The lowest price ratio at which the position will provide liquidity
   * @param ratioUpper The highest price ratio at which the position will provide liquidity
   * @param amount0Desired How much token0 to provide. Note: this is not the final amount of token0 in the position
   * @param amount1Desired How much token1 to provide. Note: this is not the final amount of token1 in the position
   * @returns A tuple containing the amount of token0 and token1 that will be minted
   */
  public async quoteMint(
    ratioLower: number,
    ratioUpper: number,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish
  ): Promise<[BigNumber, BigNumber]> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
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
          amount0: amount0Desired.toString(),
          amount1: amount1Desired.toString(),
          useFullPrecision: true,
        });

        return [
          BigNumber.from(position.amount0.numerator.toString()),
          BigNumber.from(position.amount1.numerator.toString()),
        ];
      }
    );
  }

  /**
   * Quote the amount obtained by swapping with a given amount of tokenIn.
   * @param tokenIn The address of the token to swap
   * @param tokenOut The address of the token to receive
   * @param amountIn The amount of tokenIn to swap
   * @returns The amount of tokenOut that will be received
   */
  public async quoteExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumberish
  ) {
    if (
      tokenIn != this.token0Contract.address &&
      tokenIn != this.token1Contract.address
    ) {
      throw new Error("TokenIn address does not match");
    }
    if (
      tokenOut != this.token0Contract.address &&
      tokenOut != this.token1Contract.address
    ) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const quote = await this.quoter.callStatic.quoteExactInputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: await this.poolFee(),
      amountIn,
      sqrtPriceLimitX96: 0,
    });

    return quote.amountOut.toString();
  }

  /**
   * Swap a given amount of tokenIn for tokenOut.
   * @param tokenIn The address of the token to swap
   * @param tokenOut The address of the token to receive
   * @param amountIn The amount of tokenIn to swap
   * @param amountOutMinimum The minimum amount of tokenOut to receive
   * @param recipient The address that will receive the tokenOut
   * @param deadline The deadline for the transaction
   * @returns The swap transaction
   */
  public async swapExactInput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumberish,
    amountOutMinimum: BigNumberish,
    recipient: string,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    if (
      tokenIn != this.token0Contract.address &&
      tokenIn != this.token1Contract.address
    ) {
      throw new Error("TokenIn address does not match");
    }
    if (
      tokenOut != this.token0Contract.address &&
      tokenOut != this.token1Contract.address
    ) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const tx = await this.router.exactInputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: await this.poolFee(),
      amountIn,
      amountOutMinimum,
      recipient,
      deadline: Math.ceil(deadline.getTime() / 1000),
      sqrtPriceLimitX96: 0, // We don't use this, since amountOutMinimum is enough for slippage management
    });
    return tx;
  }

  /**
   * Quote the amount of tokenIn needed to obtain a given amount of tokenOut.
   * @param tokenIn The address of the token to swap
   * @param tokenOut The address of the token to receive
   * @param amountOut The amount of tokenOut to receive
   * @returns The amount of tokenIn needed
   */
  public async quoteExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: BigNumberish
  ) {
    if (
      tokenIn != this.token0Contract.address &&
      tokenIn != this.token1Contract.address
    ) {
      throw new Error("TokenIn address does not match");
    }
    if (
      tokenOut != this.token0Contract.address &&
      tokenOut != this.token1Contract.address
    ) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const quote = await this.quoter.callStatic.quoteExactOutputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: await this.poolFee(),
      amount: amountOut, // Note that the nomenclature is different here compared to quoteExactInput
      sqrtPriceLimitX96: 0,
    });

    return quote.amountIn.toString();
  }

  /**
   * Swap tokenIn for a given amount of tokenOut.
   * @param tokenIn The address of the token to swap
   * @param tokenOut The address of the token to receive
   * @param amountOut The amount of tokenOut to receive
   * @param amountInMaximum The maximum amount of tokenIn to swap
   * @param recipient The address that will receive the tokenOut
   * @param deadline The deadline for the transaction
   * @returns The swap transaction
   */
  public async swapExactOutput(
    tokenIn: string,
    tokenOut: string,
    amountOut: string,
    amountInMaximum: string,
    recipient: string,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    if (
      tokenIn != this.token0Contract.address &&
      tokenIn != this.token1Contract.address
    ) {
      throw new Error("TokenIn address does not match");
    }
    if (
      tokenOut != this.token0Contract.address &&
      tokenOut != this.token1Contract.address
    ) {
      throw new Error("TokenOut address does not match");
    }
    if (tokenIn == tokenOut) {
      throw new Error("TokenIn and TokenOut addresses are the same");
    }

    const tx = await this.router.exactOutputSingle({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: await this.poolFee(),
      amountOut,
      amountInMaximum,
      recipient,
      deadline: Math.ceil(deadline.getTime() / 1000),
      sqrtPriceLimitX96: 0, // We don't use this, since amountInMaximum is enough for slippage management
    });
    return tx;
  }

  /**
   * Burn a given position.
   * Note: this transaction cannot be called if the position has outstanding liquidity
   * or fees to collect.
   * @param nftId The NFT ID of the position
   * @returns The burn transaction
   */
  public async burn(nftId: BigNumberish): Promise<ethers.Transaction> {
    return await this.positionManager.burn(nftId);
  }

  /**
   * Collect the fees owed to the position owner.
   * @param nftId The NFT ID of the position
   * @param recipient The address that will receive the fees
   * @param amount0Max The maximum amount of token0 to collect
   * @param amount1Max The maximum amount of token1 to collect
   * @returns The collect transaction
   */
  public async collect(
    nftId: BigNumberish,
    recipient: string,
    amount0Max: BigNumberish,
    amount1Max: BigNumberish
  ): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.collect({
      tokenId: nftId,
      recipient,
      amount0Max,
      amount1Max,
    });

    return tx;
  }

  /**
   * Collect the protocol fees.
   * @param recipient The address that will receive the fees
   * @param amount0Requested The amount of token0 to collect
   * @param amount1Requested The amount of token1 to collect
   * @returns The collect transaction
   */
  public async collectProtocol(
    recipient: string,
    amount0Requested: BigNumberish,
    amount1Requested: BigNumberish
  ): Promise<ethers.ContractTransaction> {
    const tx = await this.pool.collectProtocol(
      recipient,
      amount0Requested,
      amount1Requested
    );

    return tx;
  }

  /**
   * Increase the liquidity of a given position.
   * @param nftId The NFT ID of the position
   * @param amount0Desired The desired amount of token0 to add. Note: this is not the final amount of token0 that will be added
   * @param amount1Desired The desired amount of token1 to add. Note: this is not the final amount of token1 that will be added
   * @param amount0Min The minimum amount of token0 to add
   * @param amount1Min The minimum amount of token1 to add
   * @param deadline The deadline for the transaction
   * @returns The liquidity increase transaction
   */
  public async increaseLiquidity(
    nftId: BigNumberish,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish,
    amount0Min: BigNumberish,
    amount1Min: BigNumberish,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.increaseLiquidity({
      tokenId: nftId,
      amount0Desired,
      amount1Desired,
      amount0Min,
      amount1Min,
      deadline: Math.ceil(deadline.getTime() / 1000),
    });

    return tx;
  }

  /**
   * Quote the amount of token0 and token1 that will be added to a given position.
   * @param nftId The NFT ID of the position
   * @param amount0Desired The desired amount of token0 to add. Note: this is not the final amount of token0 that will be added
   * @param amount1Desired The desired amount of token1 to add. Note: this is not the final amount of token1 that will be added
   * @returns A tuple containing the amount of token0 and token1 that will be added
   */
  public async quoteIncreaseLiquidity(
    nftId: BigNumberish,
    amount0Desired: BigNumberish,
    amount1Desired: BigNumberish
  ): Promise<[BigNumber, BigNumber]> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
        const oldPositionRaw = await this.positionManager.positions(nftId);
        const oldPosition = new Position({
          pool: await this.asUniswapPool(),
          liquidity: oldPositionRaw.liquidity.toString(),
          tickLower: oldPositionRaw.tickLower,
          tickUpper: oldPositionRaw.tickUpper,
        });

        const amount0 = oldPosition.amount0.numerator.toString();
        const amount1 = oldPosition.amount1.numerator.toString();

        const newPosition = Position.fromAmounts({
          pool: await this.asUniswapPool(),
          tickLower: oldPositionRaw.tickLower,
          tickUpper: oldPositionRaw.tickUpper,
          amount0: BigNumber.from(amount0)
            .add(BigNumber.from(amount0Desired))
            .toString(),
          amount1: BigNumber.from(amount1)
            .add(BigNumber.from(amount1Desired))
            .toString(),
          useFullPrecision: true,
        });

        return [
          BigNumber.from(
            newPosition.amount0
              .subtract(oldPosition.amount0)
              .numerator.toString()
          ),
          BigNumber.from(
            newPosition.amount1
              .subtract(oldPosition.amount1)
              .numerator.toString()
          ),
        ];
      }
    );
  }

  /**
   * Decrease the liquidity of a given position.
   * Note: the liquidity isn't transferred directly to the position owner,
   * but is instead added to the fees to be collected by the owner.
   * @param nftId The NFT ID of the position
   * @param liquidity The amount of liquidity to remove
   * @param amount0Min The minimum amount of token0 to remove
   * @param amount1Min The minimum amount of token1 to remove
   * @param deadline The deadline for the transaction
   * @returns The liquidity decrease transaction
   */
  public async decreaseLiquidity(
    nftId: BigNumberish,
    liquidity: BigNumberish,
    amount0Min: BigNumberish,
    amount1Min: BigNumberish,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.decreaseLiquidity({
      tokenId: nftId,
      liquidity,
      amount0Min,
      amount1Min,
      deadline: Math.ceil(deadline.getTime() / 1000),
    });

    return tx;
  }

  /**
   * Quote the amount of token0 and token1 that will be removed from a given position.
   * @param nftId The NFT ID of the position
   * @param liquidity The amount of liquidity to remove
   * @returns A tuple containing the amount of token0 and token1 that will be removed
   */
  public async quoteDecreaseLiquidity(
    nftId: BigNumberish,
    liquidity: BigNumberish
  ): Promise<[BigNumber, BigNumber]> {
    return await withCustomTickSpacing(
      await this.poolFee(),
      await this.pool.tickSpacing(),
      async () => {
        const oldPositionRaw = await this.positionManager.positions(nftId);
        const oldPosition = new Position({
          pool: await this.asUniswapPool(),
          liquidity: oldPositionRaw.liquidity.toString(),
          tickLower: oldPositionRaw.tickLower,
          tickUpper: oldPositionRaw.tickUpper,
        });

        const newPosition = new Position({
          pool: await this.asUniswapPool(),
          liquidity: oldPositionRaw.liquidity.sub(liquidity).toString(),
          tickLower: oldPositionRaw.tickLower,
          tickUpper: oldPositionRaw.tickUpper,
        });

        return [
          BigNumber.from(
            oldPosition.amount0
              .subtract(newPosition.amount0)
              .numerator.toString()
          ),
          BigNumber.from(
            oldPosition.amount1
              .subtract(newPosition.amount1)
              .numerator.toString()
          ),
        ];
      }
    );
  }

  /**
   * Lock a given position until a certain date.
   * @param nftId The NFT ID of the position
   * @param lockedUntil The date until the position will be locked
   * @param deadline The deadline for the transaction
   * @returns The lock transaction
   */
  public async lock(
    nftId: BigNumberish,
    lockedUntil: Date,
    deadline: Date
  ): Promise<ethers.ContractTransaction> {
    const tx = await this.positionManager.lock(
      nftId,
      Math.floor(lockedUntil.getTime() / 1000),
      Math.ceil(deadline.getTime() / 1000)
    );
    return tx;
  }
}

export default VinuSwap;
