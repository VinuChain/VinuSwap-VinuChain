import { BigNumber } from "@ethersproject/bignumber"
import hre from 'hardhat'
import { ethers } from "hardhat"
import bn from 'bignumber.js'
import { expect } from "chai"

let deployer: any

let weth9Contract : any
let token0Contract : any
let token1Contract : any
let discountTokenContract : any

let controllerContract : any
let tieredDiscountContract : any
let factoryContract : any
let poolContract: any
let routerContract : any
let nftDescriptorLibraryContract : any
let positionDescriptorContract : any
let positionManagerContract : any

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const MONE = BigNumber.from('1000000000000000000') //10**18

const FEE = 2500 // 0.25%
const TICK_SPACING = 2
const PROTOCOL_FEE = 5 // Corresponding to 20% of the entire fee (20% of 0.25% = 0.05%). The rest (0.20%) goes to LPs
const SHARES = [1, 2, 2] // DAO treasury: 0.01%, $VINU Buy & Burns: 0.02%, $VINUCHAIN Buy & Burns: 0.02%

// Example thresholds and discounts
// Keep in mind that VinuSwap fees are in hundredths of a bip (1/1e6), while
// the discounts are in basis points (1/1e4)
const THRESHOLDS = [MONE.mul(1000), MONE.mul(10000), MONE.mul(100000), MONE.mul(1000000)]
// 1%, 2%, 3%, 4%
const DISCOUNTS = [100, 200, 300, 400]


let TOKEN_0 : string
let TOKEN_1 : string
let WETH : string
let DISCOUNT_TOKEN : string


bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })
function encodePriceSqrt(ratio : BigNumber){
  return BigNumber.from(
    new bn(ratio.toString()).sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

function getTimestamp() {
    return Math.round(Date.now() / 1000);
}

const checkQuery = async (methodName : string, params : Array<any>, expected : Array<any>, referenceContract : ethers.Contract | undefined = undefined) => {
    const serialize = x => {
        if (Array.isArray(x)) {
            return x.map(y => serialize(y))
        }
        if (typeof x == 'boolean') {
            return x
        }

        if (x instanceof BigNumber) {
            return x.toString()
        }

        return String(x)
    }
    let parsedExpected = serialize(expected) //expected.map(x => String(x))

    if (parsedExpected.length == 1) {
        parsedExpected = parsedExpected[0]
    }

    let actual = await referenceContract[methodName](...params)

    actual = serialize(actual)

    expect(await referenceContract[methodName](...params)).to.be.deep.equal(parsedExpected)
}

async function basicSetup(useMockErc20s : boolean) {
    const [a] = await ethers.getSigners()
    deployer = a
    console.log('Signer created.')

    const erc20ContractName = useMockErc20s ? 'MockERC20' : 'ERC20'
    const erc20Blueprint = await hre.ethers.getContractFactory(erc20ContractName)

    token0Contract = await erc20Blueprint.deploy()
    token1Contract = await erc20Blueprint.deploy()

    if (token0Contract.address > token1Contract.address) {
        // token0 is always the one with the lower address
        [token0Contract, token1Contract] = [token1Contract, token0Contract]
    }

    TOKEN_0 = token0Contract.address
    TOKEN_1 = token1Contract.address

    await token0Contract.connect(deployer).mint(MONE.mul(MONE))
    await token1Contract.connect(deployer).mint(MONE.mul(MONE))

    discountTokenContract = await erc20Blueprint.deploy()
    DISCOUNT_TOKEN = discountTokenContract.address

    const weth9Blueprint = await hre.ethers.getContractFactory('WETH9')
    weth9Contract = await weth9Blueprint.deploy()
    WETH = weth9Contract.address

    console.log('Finished basic setup.')
}

async function deployCommonContracts(accounts, shares, discountThresholds, discounts) {
    // Steps:
    // 1. Deploy Controller
    // 2. Deploy VinuSwapFactory
    // 3. Transfer ownership of VinuSwapFactory to Controller
    // 4. Deploy SwapRouter
    // 5. Deploy NonfungibleTokenPositionDescriptor
    // 6. Deploy NonfungiblePositionManager
    // 7. Deploy TieredDiscount
    

    // 1. Deploy Controller
    const controllerBlueprint = await hre.ethers.getContractFactory('Controller')
    controllerContract = await controllerBlueprint.deploy(
        accounts,
        shares
    )

    // 2. Deploy VinuSwapFactory
    const factoryBlueprint = await hre.ethers.getContractFactory('VinuSwapFactory')
    factoryContract = await factoryBlueprint.deploy()

    // 3. Transfer ownership of VinuSwapFactory to Controller
    await factoryContract.connect(deployer).setOwner(controllerContract.address)

    // 4. Deploy SwapRouter
    const routerBlueprint = await hre.ethers.getContractFactory('SwapRouter')
    routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

    // 5. Deploy NonfungibleTokenPositionDescriptor

    // 5.1 Deploy NFTDescriptor
    const nftDescriptorLibraryBlueprint = await hre.ethers.getContractFactory('NFTDescriptor')
    nftDescriptorLibraryContract = await nftDescriptorLibraryBlueprint.deploy()
    
    // 5.2 Deploy NonfungibleTokenPositionDescriptor
    const positionDescriptorBlueprint = await hre.ethers.getContractFactory('NonfungibleTokenPositionDescriptor', {
        libraries: {
            NFTDescriptor: nftDescriptorLibraryContract.address
        }
    })
    positionDescriptorContract = await positionDescriptorBlueprint.deploy(
        WETH,
        hre.ethers.utils.formatBytes32String('VinuSwap Position')
    )

    // 6. Deploy NonfungiblePositionManager
    const positionManagerBlueprint = await hre.ethers.getContractFactory('NonfungiblePositionManager')
    positionManagerContract = await positionManagerBlueprint.deploy(
        factoryContract.address,
        WETH,
        positionDescriptorContract.address
    )

    // 7. Deploy TieredDiscount
    const tieredDiscountBlueprint = await hre.ethers.getContractFactory('TieredDiscount')
    tieredDiscountContract = await tieredDiscountBlueprint.deploy(
        DISCOUNT_TOKEN,
        discountThresholds,
        discounts
    )

    console.log('Deployed common contracts.')
}


async function deployPool (fee, tickSpacing, discountContract, initialPrice) {
    // 1. Deploy VinuSwapPool by calling createPool on Controller
    // 2. Initialize the pool by calling initialize on Controller
    // 3. Set the protocol fee on the pool by calling setFeeProtocol on Controller

    // 1. Deploy VinuSwapPool by calling createPool on Controller
    const tx = await controllerContract.createPool(factoryContract.address, TOKEN_0, TOKEN_1, fee, tickSpacing, discountContract.address)
    const contractAddress = (await tx.wait()).events[1].args.pool

    const poolContractBlueprint = await hre.ethers.getContractFactory('VinuSwapPool')
    poolContract = poolContractBlueprint.attach(contractAddress)

    expect(poolContract.address).to.be.a('string')

    // 2. Initialize the pool by calling initialize on Controller
    await controllerContract.initialize(poolContract.address, initialPrice)

    // 3. Set the protocol fee on the pool by calling setFeeProtocol on Controller
    await controllerContract.setFeeProtocol(poolContract.address, PROTOCOL_FEE, PROTOCOL_FEE)

    console.log('Deployed pool.')
}

async function testContract (minter, swapper, fee, controllerPayees) {
    // As a sanity check, we will test the following:
    // 1. Mint a position
    // 2. Swap some tokens
    // 3. Collect LP fees
    // 4. Collect protocol fees

    const minterInitialToken0Balance = await token0Contract.balanceOf(minter.address)
    const minterInitialToken1Balance = await token1Contract.balanceOf(minter.address)
    const swapperInitialToken0Balance = await token0Contract.balanceOf(swapper.address)
    const swapperInitialToken1Balance = await token1Contract.balanceOf(swapper.address)

    // 1. Mint a position
    const mintParams = {
        token0 : TOKEN_0,
        token1 : TOKEN_1,
        fee,
        tickLower : -887272,
        tickUpper : 887272,
        amount0Desired : MONE.mul(1000),
        amount1Desired : MONE.mul(2000),
        amount0Min : 0,
        amount1Min : 0,
        recipient : minter.address,
        deadline : getTimestamp() + 1000000
    }

    await token0Contract.connect(minter).approve(positionManagerContract.address, MONE.mul(1000))
    await token1Contract.connect(minter).approve(positionManagerContract.address, MONE.mul(3000))
    await positionManagerContract.connect(minter).mint(mintParams)

    const minterIntermediateToken0Balance = await token0Contract.balanceOf(minter.address)
    const minterIntermediateToken1Balance = await token1Contract.balanceOf(minter.address)

    console.log('Minter token0 variation (after mint):', minterIntermediateToken0Balance.sub(minterInitialToken0Balance).toString())
    console.log('Minter token1 variation (after mint):', minterIntermediateToken1Balance.sub(minterInitialToken1Balance).toString())

    // 2. Swap some tokens
    await token0Contract.connect(swapper).approve(routerContract.address, MONE)

    const swapParams = {
        tokenIn : TOKEN_0,
        tokenOut : TOKEN_1,
        fee,
        recipient : swapper.address,
        deadline : getTimestamp() + 1000000,
        amountIn : MONE,
        amountOutMinimum : 0,
        sqrtPriceLimitX96 : 0
    }

    await routerContract.connect(swapper).exactInputSingle(swapParams)

    const UINT128_MAX = BigNumber.from(2).pow(128).sub(1)

    // 3. Collect LP fees
    const collectParams = {
        tokenId : 1,
        recipient : deployer.address,
        amount0Max : UINT128_MAX,
        amount1Max : UINT128_MAX
    }

    await positionManagerContract.connect(minter).collect(collectParams)

    // 4. Collect protocol fees
    await controllerContract.connect(deployer).collectProtocolFees(poolContract.address, UINT128_MAX, UINT128_MAX)
    
    const minterFinalToken0Balance = await token0Contract.balanceOf(minter.address)
    const minterFinalToken1Balance = await token1Contract.balanceOf(minter.address)
    const swapperFinalToken0Balance = await token0Contract.balanceOf(swapper.address)
    const swapperFinalToken1Balance = await token1Contract.balanceOf(swapper.address)

    console.log('Minter token0 variation (after swap):', minterFinalToken0Balance.sub(minterIntermediateToken0Balance).toString())
    console.log('Minter token1 variation (after swap):', minterFinalToken1Balance.sub(minterIntermediateToken1Balance).toString())
    console.log('Swapper token0 variation:', swapperFinalToken0Balance.sub(swapperInitialToken0Balance).toString())
    console.log('Swapper token1 variation:', swapperFinalToken1Balance.sub(swapperInitialToken1Balance).toString())

    for (let i = 0; i < controllerPayees.length; i++) {
        const payee = controllerPayees[i]
        const payeeToken0Balance = await controllerContract.balanceOf(payee, TOKEN_0)
        const payeeToken1Balance = await controllerContract.balanceOf(payee, TOKEN_1)

        console.log(`Controller payee #${i + 1} token0 balance:`, payeeToken0Balance.toString())
        console.log(`Controller payee #${i + 1} token1 balance:`, payeeToken1Balance.toString())
    }

    console.log('Tested contracts.')
}

async function main() {
    const [, alice, bob, charlie, dan] = await ethers.getSigners()

    const payeeAddresses = [alice.address, bob.address, charlie.address]

    await basicSetup(true)
    await deployCommonContracts(payeeAddresses, SHARES, THRESHOLDS, DISCOUNTS)
    await deployPool(FEE, TICK_SPACING, tieredDiscountContract, encodePriceSqrt(BigNumber.from(2)))
    await token0Contract.connect(deployer).transfer(dan.address, MONE)
    await testContract(deployer, dan, FEE, payeeAddresses)

    console.log('Done.')
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
})