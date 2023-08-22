import { Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { FeeAmount, getCreate2Address, TICK_SPACINGS } from './shared/utilities'

const { constants } = ethers

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]


describe('UniswapV3Factory', () => {
  let wallet: Wallet, other: Wallet

  let factory: any
  let noDiscount : any
  let poolBytecode: string

  before('load pool bytecode', async () => {
    poolBytecode = (await ethers.getContractFactory('VinuSwapPool')).bytecode
    const noDiscountFactory = await ethers.getContractFactory('NoDiscount')
    noDiscount = await noDiscountFactory.deploy()
  })

  beforeEach('deploy factory', async () => {
    [wallet, other] = await (ethers as any).getSigners()
    const factoryFactory = await ethers.getContractFactory('VinuSwapFactory')
    factory = await factoryFactory.deploy()
  })

  it('owner is deployer', async () => {
    expect(await factory.owner()).to.eq(wallet.address)
  })

  async function createAndCheckPool(
    tokens: [string, string],
    feeAmount: FeeAmount,
    tickSpacing: number = TICK_SPACINGS[feeAmount]
  ) {
    const tx = await factory.createPool(tokens[0], tokens[1], feeAmount, tickSpacing, noDiscount.address)
    const poolAddress = (await tx.wait()).events[0].args.pool


    await expect(factory.createPool(tokens[0], tokens[1], feeAmount, tickSpacing, noDiscount.address)).to.be.reverted
    await expect(factory.createPool(tokens[1], tokens[0], feeAmount, tickSpacing, noDiscount.address)).to.be.reverted
    expect(await factory.getPool(tokens[0], tokens[1], feeAmount), 'getPool in order').to.eq(poolAddress)
    expect(await factory.getPool(tokens[1], tokens[0], feeAmount), 'getPool in reverse').to.eq(poolAddress)

    const poolContractFactory = await ethers.getContractFactory('VinuSwapPool')
    const pool = poolContractFactory.attach(poolAddress)
    expect(await pool.factory(), 'pool factory address').to.eq(factory.address)
    expect(await pool.token0(), 'pool token0').to.eq(TEST_ADDRESSES[0])
    expect(await pool.token1(), 'pool token1').to.eq(TEST_ADDRESSES[1])
    expect(await pool.fee(), 'pool fee').to.eq(feeAmount)
    expect(await pool.tickSpacing(), 'pool tick spacing').to.eq(tickSpacing)
  }

  describe('#createPool', () => {
    it('succeeds for low fee pool', async () => {
      await createAndCheckPool(TEST_ADDRESSES, FeeAmount.LOW)
    })

    it('succeeds for medium fee pool', async () => {
      await createAndCheckPool(TEST_ADDRESSES, FeeAmount.MEDIUM)
    })
    it('succeeds for high fee pool', async () => {
      await createAndCheckPool(TEST_ADDRESSES, FeeAmount.HIGH)
    })

    it('succeeds if tokens are passed in reverse', async () => {
      await createAndCheckPool([TEST_ADDRESSES[1], TEST_ADDRESSES[0]], FeeAmount.MEDIUM)
    })

    it('fails if token a == token b', async () => {
      await expect(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[0], FeeAmount.LOW, TICK_SPACINGS[FeeAmount.LOW], noDiscount.address)).to.be.reverted
    })

    it('fails if token a is 0 or token b is 0', async () => {
      await expect(factory.createPool(TEST_ADDRESSES[0], constants.AddressZero, FeeAmount.LOW, TICK_SPACINGS[FeeAmount.LOW], noDiscount.address)).to.be.reverted
      await expect(factory.createPool(constants.AddressZero, TEST_ADDRESSES[0], FeeAmount.LOW, TICK_SPACINGS[FeeAmount.LOW], noDiscount.address)).to.be.reverted
      await expect(factory.createPool(constants.AddressZero, constants.AddressZero, FeeAmount.LOW, TICK_SPACINGS[FeeAmount.LOW], noDiscount.address)).to.be.reverted
    })
  })

  describe('#setOwner', () => {
    it('fails if caller is not owner', async () => {
      await expect(factory.connect(other).setOwner(wallet.address)).to.be.reverted
    })

    it('updates owner', async () => {
      await factory.setOwner(other.address)
      expect(await factory.owner()).to.eq(other.address)
    })

    it('emits event', async () => {
      await expect(factory.setOwner(other.address))
        .to.emit(factory, 'OwnerChanged')
        .withArgs(wallet.address, other.address)
    })

    it('cannot be called by original owner', async () => {
      await factory.setOwner(other.address)
      await expect(factory.setOwner(wallet.address)).to.be.reverted
    })
  })
})
