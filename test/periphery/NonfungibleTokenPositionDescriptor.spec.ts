import { constants, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import completeFixture from './shared/completeFixture'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { FeeAmount, TICK_SPACINGS } from './shared/constants'
import { getMaxTick, getMinTick } from './shared/ticks'
import { sortedTokens } from './shared/tokenSort'
import { extractJSONFromURI } from './shared/extractJSONFromURI'

describe('NonfungibleTokenPositionDescriptor', () => {
  let wallets: Wallet[]

  const nftPositionDescriptorCompleteFixture = async (wallets) => {
    const { factory, nft, router, nftDescriptor } = await completeFixture(wallets)
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const tokens: [any, any, any] = [
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as any, // do not use maxu256 to avoid overflowing
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as any,
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as any,
    ]
    tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

    return {
      nftPositionDescriptor: nftDescriptor,
      tokens,
      nft,
      factory
    }
  }

  let nftPositionDescriptor: any
  let tokens: [any, any, any]
  let nft: any
  let factory : any
  let weth9: any

  let noDiscount : any
  let poolFactory : any

  async function createAndInitializePoolIfNecessary(
    token0,
    token1,
    fee,
    initialPrice
  ) {
    const tx = await factory.createPool(token0, token1, fee, TICK_SPACINGS[fee], noDiscount.address)
    const poolAddress = (await tx.wait()).events[0].args.pool

    const pool = poolFactory.attach(poolAddress)
    await pool.initialize(initialPrice)
  }

  before('create fixture loader', async () => {
    wallets = await (ethers as any).getSigners()
    const noDiscountFactory = await ethers.getContractFactory('NoDiscount')
    noDiscount = await noDiscountFactory.deploy()
    poolFactory = await ethers.getContractFactory('VinuSwapPool')
  })

  beforeEach('load fixture', async () => {
    ;({ tokens, nft, nftPositionDescriptor, factory } = await nftPositionDescriptorCompleteFixture(wallets))
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    weth9 = tokenFactory.attach(await nftPositionDescriptor.WETH9()) as any
  })

  describe('#tokenURI', () => {
    it('displays ETH as token symbol for WETH token', async () => {
      const [token0, token1] = sortedTokens(weth9, tokens[1])
      await createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )
      await weth9.approve(nft.address, 100)
      await tokens[1].approve(nft.address, 100)
      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallets[0].address,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      })

      const metadata = extractJSONFromURI(await nft.tokenURI(1))
      expect(metadata.name).to.match(/(\sETH\/TEST|TEST\/ETH)/)
      expect(metadata.description).to.match(/(TEST-ETH|\sETH-TEST)/)
      expect(metadata.description).to.match(/(\nETH\sAddress)/)
    })

    it('displays returned token symbols when neither token is WETH ', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[1])
      await createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )
      await tokens[1].approve(nft.address, 100)
      await tokens[2].approve(nft.address, 100)
      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallets[0].address,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      })

      const metadata = extractJSONFromURI(await nft.tokenURI(1))
      expect(metadata.name).to.match(/TEST\/TEST/)
      expect(metadata.description).to.match(/TEST-TEST/)
    })

    it('can render a different label for native currencies', async () => {
      const [token0, token1] = sortedTokens(weth9, tokens[1])
      await createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )
      await weth9.approve(nft.address, 100)
      await tokens[1].approve(nft.address, 100)
      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallets[0].address,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      })

      const nftDescriptorLibraryFactory = await ethers.getContractFactory('NFTDescriptor')
      const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy()
      const positionDescriptorFactory = await ethers.getContractFactory('NonfungibleTokenPositionDescriptor', {
        libraries: {
          NFTDescriptor: nftDescriptorLibrary.address,
        },
      })
      const nftDescriptor = (await positionDescriptorFactory.deploy(
        weth9.address,
        // 'FUNNYMONEY' as a bytes32 string
        '0x46554e4e594d4f4e455900000000000000000000000000000000000000000000'
      )) as any

      const metadata = extractJSONFromURI(await nftDescriptor.tokenURI(nft.address, 1))
      expect(metadata.name).to.match(/(\sFUNNYMONEY\/TEST|TEST\/FUNNYMONEY)/)
      expect(metadata.description).to.match(/(TEST-FUNNYMONEY|\sFUNNYMONEY-TEST)/)
      expect(metadata.description).to.match(/(\nFUNNYMONEY\sAddress)/)
    })
  })
})
