import { BigNumber } from "@ethersproject/bignumber"
import bn from 'bignumber.js'

import chai from "chai"
import chaiAsPromised from "chai-as-promised"


import hre from 'hardhat'
hre.tracer.enabled = false

import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { splitSignature } from 'ethers/lib/utils'

chai.use(chaiAsPromised)
const expect = chai.expect

let deployer: any

let controllerBlueprint : hre.ethers.ContractFactory
let tieredDiscountBlueprint : hre.ethers.ContractFactory
let overridableFeeManagerBlueprint : hre.ethers.ContractFactory
let noDiscountBlueprint : hre.ethers.ContractFactory
let factoryBlueprint : hre.ethers.ContractFactory
let poolContractBlueprint: ethers.ContractFactory
let routerBlueprint : hre.ethers.ContractFactory
let nftDescriptorLibraryBlueprint : hre.ethers.ContractFactory
let positionDescriptorBlueprint : hre.ethers.ContractFactory
let positionManagerBlueprint : hre.ethers.ContractFactory

let erc20Blueprint : hre.ethers.ContractFactory
let noDiscountContract : any
let factoryContract : any
let poolContract: any
let routerContract : any
let nftDescriptorLibraryContract : any
let positionDescriptorContract : any
let positionManagerContract : any

let mnemonicCounter = 1

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const MONE = BigNumber.from('1000000000000000000') //10**18
const FEE = 25
const TICK_SPACING = 2


let TOKEN_0 : string
let TOKEN_1 : string
let WETH : string

let token0Contract : any
let token1Contract : any

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 }) 
function encodePriceSqrt(ratio : BigNumber){
  return BigNumber.from(
    new bn(ratio.toString()).sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

export default async function getPermitNFTSignature(
    wallet,
    positionManager,
    spender: string,
    tokenId,
    deadline,
    permitConfig
    ) {
    const [nonce, name, version, chainId] = await Promise.all([
        permitConfig?.nonce ?? positionManager.positions(tokenId).then((p) => p.nonce),
        permitConfig?.name ?? positionManager.name(),
        permitConfig?.version ?? '1',
        permitConfig?.chainId ?? wallet.getChainId(),
    ])

    return splitSignature(
        await wallet._signTypedData(
        {
            name,
            version,
            chainId,
            verifyingContract: positionManager.address,
        },
        {
            Permit: [
            {
                name: 'spender',
                type: 'address',
            },
            {
                name: 'tokenId',
                type: 'uint256',
            },
            {
                name: 'nonce',
                type: 'uint256',
            },
            {
                name: 'deadline',
                type: 'uint256',
            },
            ],
        },
        {
            owner: wallet.address,
            spender,
            tokenId,
            nonce,
            deadline,
        }
        )
    )
    }

const checkQuery = async (methodName : string, params : Array<any>, expected : Array<any>, referenceContract : ethers.Contract | undefined = undefined) => {
    if (!referenceContract) {
        referenceContract = poolContract
    }

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
    let parsedExpected = serialize(expected)

    if (parsedExpected.length == 1) {
        parsedExpected = parsedExpected[0]
    }

    let actual = await referenceContract[methodName](...params)

    actual = serialize(actual)

    expect(await referenceContract[methodName](...params)).to.be.deep.equal(parsedExpected)
}

const newUsers = async (...tokenInfos : Array<Array<Array<String | Number>>>) => {
    const users : Array<any> = []
    for (const tokenInfo of tokenInfos) {
        const [...allUsers] = await ethers.getSigners()
        const user = allUsers[mnemonicCounter++]

        const currentTokens = [token0Contract, token1Contract]
        const currentContracts = [poolContract, factoryContract]

        for (const tokenPair of tokenInfo) {
            const matchingToken = currentTokens.find(x => x.address == tokenPair[0])
            
            await matchingToken.connect(user).mint(String(tokenPair[1]))

            for (const currentContract of currentContracts) {
                await matchingToken.connect(user).approve(currentContract.address, String(tokenPair[1]))
            }
        }

        users.push(user)
    }

    return users
}


describe('test VinuSwapPool', function () {
    before(async function() {
        this.timeout(0)

        const [a] = await ethers.getSigners()
        deployer = a
        console.log('Signer created.')

        erc20Blueprint = await hre.ethers.getContractFactory('MockERC20')

        token0Contract = await erc20Blueprint.deploy()
        token1Contract = await erc20Blueprint.deploy()

        // token1Contract.address is always greater than token0Contract.address
        if (token0Contract.address > token1Contract.address) {
            [token0Contract, token1Contract] = [token1Contract, token0Contract]
        }

        TOKEN_0 = token0Contract.address
        TOKEN_1 = token1Contract.address

        const weth9Blueprint = await hre.ethers.getContractFactory('WETH9')
        const weth9Contract = await weth9Blueprint.deploy()
        WETH = weth9Contract.address

        //await transpileContract('contracts/BasePool.solpp')
        //await transpileContract('contracts/Controller.solpp')
        console.log('Deployed ERC20s.')


        await token0Contract.connect(deployer).mint(MONE.mul(MONE))
        await token1Contract.connect(deployer).mint(MONE.mul(MONE))

        console.log('Compiling contracts...')

        // Note: PoolInitHelper must be compiled with the exact same settings
        // (including optimization runs) as the factory
        const poolInitHelperBlueprint = await hre.ethers.getContractFactory('PoolInitHelper')
        const poolInitHelperContract = await poolInitHelperBlueprint.deploy()
        console.log('Init code hash:', await poolInitHelperContract.getInitCodeHash())

        controllerBlueprint = await hre.ethers.getContractFactory('Controller')

        tieredDiscountBlueprint = await hre.ethers.getContractFactory('TieredDiscount')
        overridableFeeManagerBlueprint = await hre.ethers.getContractFactory('OverridableFeeManager')
        noDiscountBlueprint = await hre.ethers.getContractFactory('NoDiscount')

        factoryBlueprint = await hre.ethers.getContractFactory('VinuSwapFactory')

        poolContractBlueprint = await hre.ethers.getContractFactory('VinuSwapPool')

        routerBlueprint = await hre.ethers.getContractFactory('SwapRouter')

        nftDescriptorLibraryBlueprint = await hre.ethers.getContractFactory('NFTDescriptor')
        nftDescriptorLibraryContract = await nftDescriptorLibraryBlueprint.deploy()

        positionDescriptorBlueprint = await hre.ethers.getContractFactory('NonfungibleTokenPositionDescriptor', {
            libraries: {
                NFTDescriptor: nftDescriptorLibraryContract.address
            }
        })

        positionManagerBlueprint = await hre.ethers.getContractFactory('NonfungiblePositionManager')

        console.log('Finished compiling contracts.')
    })

    describe('contract deployment', function () {
        it('deploys the contract', async function() {
            factoryContract = await factoryBlueprint.deploy()

            expect(factoryContract.address).to.be.a('string')

            noDiscountContract = await noDiscountBlueprint.deploy()
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, noDiscountContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)
            console.log('Deployed router.')

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )
            console.log('Deployed position descriptor.')

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )
        })
    })

    describe('contract execution', function () {
        beforeEach(async function () {
            factoryContract = await factoryBlueprint.deploy()

            expect(factoryContract.address).to.be.a('string')

            noDiscountContract = await noDiscountBlueprint.deploy()
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, noDiscountContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )
        })

        describe('sanity checks', function () {
            // These tests do not cover new features, they are only meant
            // to make sure that the contract is working as usual
            describe('liquidity', function () {
                it('deposits liquidity', async function () {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 2000,
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                })
                it('deposits and increases liquidity', async function () {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 2000,
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    const increaseParams = {
                        tokenId : 1,
                        amount0Desired : 50,
                        amount1Desired : 100,
                        amount0Min: 0,
                        amount1Min : 0,
                        deadline: await time.latest() + 1000000
                    }

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '50')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '100')

                    await positionManagerContract.connect(deployer).increaseLiquidity(increaseParams)

                })
                it('deposits and decreases liquidity', async function () {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 3000, // We're setting 3k, but only 2k will be taken
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
                    const initialToken1Balance = await token1Contract.balanceOf(deployer.address)

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)

                    const decreaseParams = {
                        tokenId : 1,
                        liquidity : 707, // Corresponding to 50% of the current liqudity
                        amount0Min : 0,
                        amount1Min : 0,
                        deadline : await time.latest() + 1000000
                    }

                    await positionManagerContract.connect(deployer).decreaseLiquidity(decreaseParams)

                    await checkQuery('liquidity', [], [707], poolContract)
                    // Since the current ratio was 2:1, the obtained amounts are 2:1 as well
                    // Note that the amounts are not exact because of rounding
                    await checkQuery('tokensOwed', [1], [499, 999], positionManagerContract)

                    const collectParams = {
                        tokenId : 1,
                        recipient : deployer.address,
                        amount0Max : 1000,
                        amount1Max : 2000
                    }

                    await positionManagerContract.connect(deployer).collect(collectParams)

                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000).add(499)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000).add(999)], token1Contract)
                })

                it('deposits, decreases and burns', async function () {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 3000, // We're setting 3k, but only 2k will be taken
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
                    const initialToken1Balance = await token1Contract.balanceOf(deployer.address)

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)


                    const decreaseParams = {
                        tokenId : 1,
                        liquidity : 1414, // Corresponding to 100% of the current liqudity
                        amount0Min : 0,
                        amount1Min : 0,
                        deadline : await time.latest() + 1000000
                    }

                    await positionManagerContract.connect(deployer).decreaseLiquidity(decreaseParams)

                    await checkQuery('liquidity', [], [0], poolContract)
                    // Since the current ratio was 2:1, the obtained amounts are 2:1 as well
                    // Note that the amounts are not exact because of rounding
                    await checkQuery('tokensOwed', [1], [999, 1999], positionManagerContract)

                    const collectParams = {
                        tokenId : 1,
                        recipient : deployer.address,
                        amount0Max : 1000,
                        amount1Max : 2000
                    }

                    await positionManagerContract.connect(deployer).collect(collectParams)

                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(1)], token1Contract)

                    await positionManagerContract.connect(deployer).burn(1)
                })
            })

            describe('swapping', function () {
                it('swaps with exact input', async function () {
                    const [alice] = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 3000, // We're setting 3k, but only 2k will be taken
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
                    const initialToken1Balance = await token1Contract.balanceOf(deployer.address)

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)

                    await token0Contract.connect(alice).approve(routerContract.address, '100')

                    const swapParams = {
                        tokenIn : TOKEN_0,
                        tokenOut : TOKEN_1,
                        fee : FEE,
                        recipient : alice.address,
                        deadline : await time.latest() + 1000000,
                        amountIn : 100,
                        amountOutMinimum : 71,
                        sqrtPriceLimitX96 : 0
                    }

                    await routerContract.connect(alice).exactInputSingle(swapParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)
                    await checkQuery('balanceOf', [alice.address], [0], token0Contract)
                    await checkQuery('balanceOf', [alice.address], [100 + 171], token1Contract)
                })
                it('swaps with exact output', async function () {
                    const [alice] = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : FEE,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : 1000,
                        amount1Desired : 3000, // We're setting 3k, but only 2k will be taken
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
                    const initialToken1Balance = await token1Contract.balanceOf(deployer.address)

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)

                    await token0Contract.connect(alice).approve(routerContract.address, '100')

                    const swapParams = {
                        tokenIn : TOKEN_0,
                        tokenOut : TOKEN_1,
                        fee : FEE,
                        recipient : alice.address,
                        deadline : await time.latest() + 1000000,
                        amountOut : 171,
                        amountInMaximum : 100,
                        sqrtPriceLimitX96 : 0
                    }

                    await routerContract.connect(alice).exactOutputSingle(swapParams)

                    await checkQuery('liquidity', [], [1414], poolContract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)
                    await checkQuery('balanceOf', [alice.address], [0], token0Contract)
                    await checkQuery('balanceOf', [alice.address], [100 + 171], token1Contract)
                })
            })
        })

        describe('locking', function () {
            it('locks a position', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                await positionManagerContract.connect(deployer).lock(1, await time.latest() + 30, await time.latest() + 1000000)
            })
            it('re-locks a position', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() + 1000

                await positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() + 1000000)

                await time.setNextBlockTimestamp(lockedUntil)

                await positionManagerContract.connect(deployer).lock(1, lockedUntil + 60, await time.latest() + 1000000)
            })
            it('locks someone else\'s position when approved', async function () {
                const [alice] = await newUsers([])
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                // Approve Alice
                const permitDeadline = await time.latest() + 100000
                const { v, r, s } = await getPermitNFTSignature(deployer, positionManagerContract, alice.address, 1, permitDeadline)
                await positionManagerContract.permit(alice.address, 1, permitDeadline, v, r, s)
                expect((await positionManagerContract.positions(1)).nonce).to.eq(1)
                expect((await positionManagerContract.positions(1)).operator).to.eq(alice.address)

                const lockedUntil = await time.latest() + 1000
                await positionManagerContract.connect(alice).lock(1, lockedUntil, await time.latest() + 1000000)
            })
            it('reduces liquidity after the lock deadline', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() + 1000

                await positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() + 1000000)

                await time.setNextBlockTimestamp(lockedUntil)

                const decreaseParams = {
                    tokenId : 1,
                    liquidity : 707, // Corresponding to 50% of the current liqudity
                    amount0Min : 0,
                    amount1Min : 0,
                    deadline : await time.latest() + 1000000
                }

                await positionManagerContract.connect(deployer).decreaseLiquidity(decreaseParams)
            })
            it('fails to lock a non-existent token', async function () {
                await expect(
                    positionManagerContract.connect(deployer).lock(1, await time.latest() + 100, await time.latest() + 1000000)
                ).to.be.eventually.rejectedWith('ERC721: operator query for nonexistent token')
            })
            it('fails to lock someone else\'s position without being approved', async function () {
                const [alice] = await newUsers([])
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                await expect(
                    positionManagerContract.connect(alice).lock(1, await time.latest() + 1000, await time.latest() + 1000000)
                ).to.be.eventually.rejectedWith('Not approved')
            })
            it('fails to lock a position after the deadline', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() + 1000

                await expect(
                    positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() - 1)
                ).to.be.eventually.rejectedWith('Transaction too old')
            })
            it('fails to lock a position in the past', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000, // We're setting 3k, but only 2k will be taken
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() - 1

                await expect(
                    positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() + 10000)
                ).to.be.eventually.rejectedWith('Invalid lockedUntil')
            })
            it('fails to lock a position earlier than the current lock', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() + 1000
                await positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() + 1000000)

                await expect(
                    positionManagerContract.connect(deployer).lock(1, lockedUntil - 1, await time.latest() + 1000000)
                ).to.be.eventually.rejectedWith('Invalid lockedUntil')
            })
            it('fails to reduce liquidity before the lock deadline', async function () {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                const mintParams = {
                    token0 : TOKEN_0,
                    token1 : TOKEN_1,
                    fee : FEE,
                    tickLower : -887272,
                    tickUpper : 887272,
                    amount0Desired : 1000,
                    amount1Desired : 3000,
                    amount0Min : 0,
                    amount1Min : 0,
                    recipient : deployer.address,
                    deadline : await time.latest() + 1000000
                }

                await token0Contract.connect(deployer).approve(positionManagerContract.address, '1000')
                await token1Contract.connect(deployer).approve(positionManagerContract.address, '2000')
                await positionManagerContract.connect(deployer).mint(mintParams)

                const lockedUntil = await time.latest() + 1000
                await positionManagerContract.connect(deployer).lock(1, lockedUntil, await time.latest() + 1000000)


                const decreaseParams = {
                    tokenId : 1,
                    liquidity : 707, // Corresponding to 50% of the current liqudity
                    amount0Min : 0,
                    amount1Min : 0,
                    deadline : await time.latest() + 1000000
                }

                await expect(
                    positionManagerContract.connect(deployer).decreaseLiquidity(decreaseParams)
                ).to.be.eventually.rejectedWith('Locked')

            })
        })

        describe('controller', function () {
            describe('controller setup', function () {
                it('deploys a controller', async function () {
                    const [alice, bob, charlie, dan] = await newUsers([], [], [], [])
                    const controller = await controllerBlueprint.connect(dan).deploy(
                        [alice.address, bob.address, charlie.address],
                        [100, 200, 700]
                    )
                    expect(controller.address).to.be.a('string')
                })

                it('fails to deploy a controller with no accounts', async function () {
                    const [dan] = await newUsers([])
                    await expect(
                        controllerBlueprint.connect(dan).deploy(
                            [],
                            []
                        )
                    ).to.be.eventually.rejectedWith('At least one account is required')
                })

                it('fails to deploy a controller with mismatching accounts and shares', async function () {
                    const [alice, bob, charlie, dan] = await newUsers([], [], [], [])
                    await expect(
                        controllerBlueprint.connect(dan).deploy(
                            [alice.address, bob.address, charlie.address],
                            [100, 200]
                        )
                    ).to.be.eventually.rejectedWith('Accounts and shares must have the same length')
                })

                it('fails to deploy a controller with a zero address account', async function () {
                    const [alice, bob, dan] = await newUsers([], [], [])
                    await expect(
                        controllerBlueprint.connect(dan).deploy(
                            [alice.address, bob.address, ZERO_ADDRESS],
                            [100, 200, 700]
                        )
                    ).to.be.eventually.rejectedWith('Account must not be the zero address')
                })

                it('fails to deploy a controller with a zero share account', async function () {
                    const [alice, bob, charlie, dan] = await newUsers([], [], [], [])
                    await expect(
                        controllerBlueprint.connect(dan).deploy(
                            [alice.address, bob.address, charlie.address],
                            [100, 0, 700]
                        )
                    ).to.be.eventually.rejectedWith('Shares must be greater than zero')
                })

                it('fails to deploy a controller with duplicated accounts', async function () {
                    const [alice, bob, dan] = await newUsers([], [], [])
                    await expect(
                        controllerBlueprint.connect(dan).deploy(
                            [alice.address, bob.address, bob.address],
                            [100, 200, 700]
                        )
                    ).to.be.eventually.rejectedWith('Account already has shares')
                })
            })

            describe('controller usage', function () {
                let controllerContract : any
                let mockPoolBlueprint :  hre.ethers.ContractFactory
                let mockPoolContract : any
                let alice, bob, charlie, dan

                before(async function () {
                    mockPoolBlueprint = await ethers.getContractFactory('MockPool')
                })

                beforeEach(async function () {
                    const users = await newUsers([], [], [], [])
                    alice = users[0]
                    bob = users[1]
                    charlie = users[2]
                    dan = users[3]

                    controllerContract = await controllerBlueprint.connect(dan).deploy(
                        [alice.address, bob.address, charlie.address],
                        [100, 200, 700]
                    )
                    await checkQuery('totalShares', [], [1000], controllerContract)
                    mockPoolContract = await mockPoolBlueprint.deploy(TOKEN_0, TOKEN_1)
                })
                it('collects fees from a mock pool', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    await controllerContract.connect(alice).collectProtocolFees(mockPoolContract.address, 1000, 2000)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400], controllerContract)
                })
                it('collects requests larger than the protocol fees', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    // There's only 1000 and 2000 in the contract, but we request 1100 and 2100
                    await controllerContract.connect(alice).collectProtocolFees(mockPoolContract.address, 1100, 2100)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400], controllerContract)
                })
                it('correctly handles rounding errors', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000001)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000001)
                    await mockPoolContract.connect(deployer).deposit(1000001, 2000001)

                    await controllerContract.connect(alice).collectProtocolFees(mockPoolContract.address, 1000001, 2000001)

                    // Alice has 10% of the shares, but receives the dust
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100001], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200001], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200000], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400000], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700000], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400000], controllerContract)
                })
                it('fails to collect without being an account or the owner', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    const [eric] = await newUsers([])

                    await expect(
                        controllerContract.connect(eric).collectProtocolFees(mockPoolContract.address, 1000, 2000)
                    ).to.be.eventually.rejectedWith('Not an account or owner')
                })
                it('withdraws', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    await controllerContract.connect(dan).collectProtocolFees(mockPoolContract.address, 1000, 2000)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400], controllerContract)

                    await controllerContract.connect(alice).withdraw(TOKEN_0, 40)
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [60], controllerContract)
                    await checkQuery('balanceOf', [alice.address], [40], token0Contract)
                })
                it('fails to withdraw more than the balance', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    await controllerContract.connect(dan).collectProtocolFees(mockPoolContract.address, 1000, 2000)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400], controllerContract)

                    await expect(
                        controllerContract.connect(alice).withdraw(TOKEN_0, 101)
                    ).to.be.eventually.rejectedWith('Insufficient balance')
                })
                it('fails to withdraw 0', async function () {
                    await token0Contract.connect(deployer).approve(mockPoolContract.address, 1000)
                    await token1Contract.connect(deployer).approve(mockPoolContract.address, 2000)
                    await mockPoolContract.connect(deployer).deposit(1000, 2000)

                    await controllerContract.connect(dan).collectProtocolFees(mockPoolContract.address, 1000, 2000)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [100], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [200], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [200], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [400], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [700], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [1400], controllerContract)

                    await expect(
                        controllerContract.connect(alice).withdraw(TOKEN_0, 0)
                    ).to.be.eventually.rejectedWith('Cannot withdraw 0')
                })
                it('collects fees from an actual pool', async function () {
                    const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[0].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)

                    expect(poolContract.address).to.be.a('string')

                    routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

                    positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                        WETH,
                        hre.ethers.utils.formatBytes32String('VinuSwap Position')
                    )

                    positionManagerContract = await positionManagerBlueprint.deploy(
                        factoryContract.address,
                        WETH,
                        positionDescriptorContract.address
                    )

                    const [eric] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

                    const mintParams = {
                        token0 : TOKEN_0,
                        token1 : TOKEN_1,
                        fee : 100000,
                        tickLower : -887272,
                        tickUpper : 887272,
                        amount0Desired : MONE.mul(1000),
                        amount1Desired : MONE.mul(2000),
                        amount0Min : 0,
                        amount1Min : 0,
                        recipient : deployer.address,
                        deadline : await time.latest() + 1000000
                    }

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
                    await positionManagerContract.connect(deployer).mint(mintParams)

                    await token0Contract.connect(eric).approve(routerContract.address, MONE)

                    const swapParams = {
                        tokenIn : TOKEN_0,
                        tokenOut : TOKEN_1,
                        fee : 100000,
                        recipient : eric.address,
                        deadline : await time.latest() + 1000000,
                        amountIn : MONE,
                        amountOutMinimum : 0,
                        sqrtPriceLimitX96 : 0
                    }

                    await poolContract.setFeeProtocol(4, 5)
                    await factoryContract.setOwner(controllerContract.address)

                    await routerContract.connect(eric).exactInputSingle(swapParams)

                    // The fee is 0.1 MONE in token0 and 0 in token1
                    // The protocol fee is 4, i.e. 25%
                    // So we are expecting 0.1 MONE / 4 = 0.025 MONE token0 and 0 token1
                    const expectedFee = MONE.div(10).div(4)

                    const protocolFees = await poolContract.protocolFees()
                    expect(protocolFees.token0).to.equal(expectedFee)
                    expect(protocolFees.token1).to.equal(0)

                    const UINT128_MAX = BigNumber.from(2).pow(128).sub(1)
                    await controllerContract.connect(dan).collectProtocolFees(poolContract.address, UINT128_MAX, UINT128_MAX)

                    // Alice has 10% of the shares
                    await checkQuery('balanceOf', [alice.address, TOKEN_0], [expectedFee.div(10).add(1)], controllerContract)
                    await checkQuery('balanceOf', [alice.address, TOKEN_1], [0], controllerContract)

                    // Bob has 20% of the shares
                    await checkQuery('balanceOf', [bob.address, TOKEN_0], [expectedFee.div(10).mul(2).sub(1)], controllerContract)
                    await checkQuery('balanceOf', [bob.address, TOKEN_1], [0], controllerContract)

                    // Charlie has 70% of the shares
                    await checkQuery('balanceOf', [charlie.address, TOKEN_0], [expectedFee.div(10).mul(7).sub(1)], controllerContract)
                    await checkQuery('balanceOf', [charlie.address, TOKEN_1], [0], controllerContract)
                })
                it('creates a pool', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    
                    // Check that it was deployed correctly
                    await checkQuery('token0', [], [TOKEN_0], poolContract)
                })
                it('fails to create a pool without being the owner', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const [eric] = await newUsers([])

                    await expect(
                        controllerContract.connect(eric).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                })
                it('initializes a pool', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await controllerContract.initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))
                })
                it('fails to initialize a pool without being the owner', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    const [eric] = await newUsers([])

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await expect(
                        controllerContract.connect(eric).initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))
                    ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                })
                it('sets protocol fees', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await controllerContract.initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))
                    await controllerContract.connect(dan).setFeeProtocol(poolContract.address, 4, 5)
                })
                it('fails to set protocol fees without being the owner', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await controllerContract.initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))

                    const [eric] = await newUsers([])

                    await expect(
                        controllerContract.connect(eric).setFeeProtocol(poolContract.address, 4, 5)
                    ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                })

                it('transfers a pool\'s ownership', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await controllerContract.initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))

                    await controllerContract.connect(dan).transferFactoryOwnership(factoryContract.address, alice.address)

                    expect(await factoryContract.owner()).to.equal(alice.address)
                })

                it('fails to transfer a pool\'s ownership without being the owner', async function () {
                    await factoryContract.setOwner(controllerContract.address)

                    const tx = await controllerContract.connect(dan).createPool(factoryContract.address, TOKEN_0, TOKEN_1, 100000, 1, (await noDiscountBlueprint.deploy()).address)
                    const contractAddress = (await tx.wait()).events[1].args.pool

                    poolContract = poolContractBlueprint.attach(contractAddress)
                    await controllerContract.initialize(poolContract.address, encodePriceSqrt(BigNumber.from(2)))

                    const [eric] = await newUsers([])

                    await expect(
                        controllerContract.connect(eric).transferFactoryOwnership(factoryContract.address, alice.address)
                    ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                })

                describe('standard pool deployment', function () {
                    it('sets the default fee manager', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const noDiscountContract = await noDiscountBlueprint.deploy()

                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)

                        expect(await controllerContract.defaultFeeManager(factoryContract.address)).to.equal(noDiscountContract.address)
                    })
                    it('resets the default fee manager', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const noDiscountContract = await noDiscountBlueprint.deploy()

                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, ZERO_ADDRESS)

                        expect(await controllerContract.defaultFeeManager(factoryContract.address)).to.equal(ZERO_ADDRESS)
                    })
                    it('fails to set the default fee manager without being the owner', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const noDiscountContract = await noDiscountBlueprint.deploy()

                        const [eric] = await newUsers([])

                        await expect(
                            controllerContract.connect(eric).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                    })
                    /*it('fails to set the default fee manager to a zero address', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await expect(
                            controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, ZERO_ADDRESS)
                        ).to.be.eventually.rejectedWith('Fee manager must not be the zero address')
                    })*/
                    it('sets the default tick spacing', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        expect(await controllerContract.defaultTickSpacing(factoryContract.address, 200)).to.equal(60)
                    })
                    it('resets the default tick spacing', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 0)

                        expect(await controllerContract.defaultTickSpacing(factoryContract.address, 200)).to.equal(0)
                    })
                    it('fails to set the default tick spacing without being the owner', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        await expect(
                            controllerContract.connect(eric).setDefaultTickSpacing(factoryContract.address, 200, 60)
                        ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
                    })
                    /*it('fails to set the default tick spacing to zero', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await expect(
                            controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 0)
                        ).to.be.eventually.rejectedWith('Invalid tick spacing')
                    })*/
                    it('fails to set the default tick spacing to a value greater than 16384', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await expect(
                            controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 16384 + 1)
                        ).to.be.eventually.rejectedWith('Invalid tick spacing')
                    })
                    it('fails to set the default tick spacing to a negative value', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        await expect(
                            controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, -1)
                        ).to.be.eventually.rejectedWith('Invalid tick spacing')
                    })
                    it('deploys a standard pool', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        const tx = await controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)

                        const contractAddress = (await tx.wait()).events[1].args.pool

                        poolContract = poolContractBlueprint.attach(contractAddress)

                        expect(await poolContract.token0()).to.equal(TOKEN_0)
                        expect(await poolContract.token1()).to.equal(TOKEN_1)
                        expect(await poolContract.fee()).to.equal(200)
                        expect(await poolContract.tickSpacing()).to.equal(60)
                        expect(await poolContract.feeManager()).to.equal(noDiscountContract.address)
                    })
                    it('fails to deploy a standard pool if the default fee manager is not set', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        //const noDiscountContract = await noDiscountBlueprint.deploy()
                        //await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Fee manager not set')
                    })
                    it('fails to deploy a standard pool if the default fee manager is set for the wrong factory', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const newFactoryContract = await factoryBlueprint.deploy()

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(newFactoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Fee manager not set')
                    })
                    it('fails to deploy a standard pool if the default tick spacing is not set', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        //await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Tick spacing not set')
                    })
                    it('fails to deploy a standard pool if the default tick spacing is set for the wrong factory', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const newFactoryContract = await factoryBlueprint.deploy()

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(newFactoryContract.address, 200, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Tick spacing not set')
                    })
                    it('fails to deploy a standard pool if the default tick spacing is set for the wrong factory', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 150, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Tick spacing not set')
                    })
                    it('fails to deploy a standard pool if neither the fee manager nor the tick spacing are set', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        //const noDiscountContract = await noDiscountBlueprint.deploy()
                        //await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        //await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Fee manager not set')
                    })
                    it('fails to deploy a standard pool if the fee manager has been reset', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, ZERO_ADDRESS)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Fee manager not set')
                    })
                    it('fails to deploy a standard pool if the tick spacing has been reset', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 0)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Tick spacing not set')
                    })
                    it('fails to deploy a standard pool if both the fee manager and the tick spacing have been reset', async function () {
                        await factoryContract.setOwner(controllerContract.address)

                        const [eric] = await newUsers([])

                        const noDiscountContract = await noDiscountBlueprint.deploy()
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, noDiscountContract.address)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 60)
                        await controllerContract.connect(dan).setDefaultFeeManager(factoryContract.address, ZERO_ADDRESS)
                        await controllerContract.connect(dan).setDefaultTickSpacing(factoryContract.address, 200, 0)

                        await expect(
                            controllerContract.connect(eric).createStandardPool(factoryContract.address, TOKEN_0, TOKEN_1, 200)
                        ).to.be.eventually.rejectedWith('Fee manager not set')
                    })
                })
            })
        })
    })

    describe('updated deployment', function () {
        // Sanity checks after the various modifications to how deployment works

        beforeEach(async function () {
            noDiscountContract = await noDiscountBlueprint.deploy()
            expect(noDiscountContract.address).to.be.a('string')
            factoryContract = await factoryBlueprint.deploy()
            expect(factoryContract.address).to.be.a('string')
        })

        it('deploys a pool', async function () {
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, noDiscountContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool
            expect(contractAddress).to.be.a('string')
        })

        it('deploys a pool with a new owner', async function () {
            const [alice] = await newUsers([])
            await factoryContract.setOwner(alice.address)

            const tx = await factoryContract.connect(alice).createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, noDiscountContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool
            expect(contractAddress).to.be.a('string')
        })

        it('fails to deploy when the two tokens are the same', async function () {
            await expect(
                factoryContract.createPool(TOKEN_0, TOKEN_0, FEE, TICK_SPACING, noDiscountContract.address)
            ).to.be.eventually.rejected
        })

        it('fails to deploy with a fee too high', async function () {
            // 100.0001% fee
            await expect(
                factoryContract.createPool(TOKEN_0, TOKEN_1, 1000001, TICK_SPACING, noDiscountContract.address)
            ).to.be.eventually.rejected
        })

        it('fails to deploy with a zero tick spacing', async function () {
            await expect(
                factoryContract.createPool(TOKEN_0, TOKEN_1, FEE, 0, noDiscountContract.address)
            ).to.be.eventually.rejected
        })

        it('fails to deploy with a tick spacing too high', async function () {
            await expect(
                factoryContract.createPool(TOKEN_0, TOKEN_1, FEE, 16384 + 1, noDiscountContract.address)
            ).to.be.eventually.rejected
        })

        it('fails to deploy without being the owner', async function () {
            const [alice] = await newUsers([])
            await expect(
                factoryContract.connect(alice).createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, noDiscountContract.address)
            ).to.be.eventually.rejected
        })
    })

    describe('overridable fee manager', function () {
        const FEE_TIER_FEE = 100000 // 10%
        const FEE_TIER_TICK_SPACING = 1
        beforeEach(async function () {
            noDiscountContract = await noDiscountBlueprint.deploy()
            expect(noDiscountContract.address).to.be.a('string')
            factoryContract = await factoryBlueprint.deploy()
            expect(factoryContract.address).to.be.a('string')
        })

        it('deploys a pool with an overridable fee manager', async function () {
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)

            await factoryContract.setOwner(alice.address)

            const tx = await factoryContract.connect(alice).createPool(TOKEN_0, TOKEN_1, FEE, TICK_SPACING, feeManagerContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool
            expect(contractAddress).to.be.a('string')
        })

        async function checkPoolForFeeManager(feeManager, postCreationOperation) {
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE_TIER_FEE, FEE_TIER_TICK_SPACING, feeManager.address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            if (postCreationOperation) {
                await postCreationOperation(poolContract)
            }

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )

            const [alice] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
            await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

            const mintParams = {
                token0 : TOKEN_0,
                token1 : TOKEN_1,
                fee : FEE_TIER_FEE,
                tickLower : -887272,
                tickUpper : 887272,
                amount0Desired : MONE.mul(1000),
                amount1Desired : MONE.mul(2000),
                amount0Min : 0,
                amount1Min : 0,
                recipient : deployer.address,
                deadline : await time.latest() + 1000000
            }

            await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
            await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
            await positionManagerContract.connect(deployer).mint(mintParams)

            await token0Contract.connect(alice).approve(routerContract.address, MONE)

            const swapParams = {
                tokenIn : TOKEN_0,
                tokenOut : TOKEN_1,
                fee : FEE_TIER_FEE,
                recipient : alice.address,
                deadline : await time.latest() + 1000000,
                amountIn : MONE,
                amountOutMinimum : 0,
                sqrtPriceLimitX96 : 0
            }

            await routerContract.connect(alice).exactInputSingle(swapParams)

            // Collect the fees

            const collectParams = {
                tokenId : 1,
                recipient : deployer.address,
                amount0Max : BigNumber.from(2).pow(128).sub(1),
                amount1Max : BigNumber.from(2).pow(128).sub(1)
            }

            const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
            const initialToken1Balance = await token1Contract.balanceOf(deployer.address)
            await positionManagerContract.connect(deployer).collect(collectParams)

            const finalToken0Balance = await token0Contract.balanceOf(deployer.address)
            const finalToken1Balance = await token1Contract.balanceOf(deployer.address)

            const token0Amount = finalToken0Balance.sub(initialToken0Balance)
            const token1Amount = finalToken1Balance.sub(initialToken1Balance)

            return [token0Amount, token1Amount]
        }

        it('checks that the fee manager respects the default when nothing is set', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const fixedDiscountContract = await halfDiscountBlueprint.deploy()
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(fixedDiscountContract.address)
            await feeManagerContract.transferOwnership(alice.address)

            const [token0Amount, token1Amount] = await checkPoolForFeeManager(feeManagerContract, null)

            // Discount has been applied
            expect(token0Amount.toString()).to.be.equal('49999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that the fee manager can be overridden', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            const [token0Amount, token1Amount] = await checkPoolForFeeManager(feeManagerContract, async function (poolContract) {
                await feeManagerContract.connect(alice).setFeeManagerOverride(poolContract.address, fixedDiscountContract.address)
            })

            expect(token0Amount.toString()).to.be.equal('49999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that the fee manager uses the default when the override is for another address', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            const [token0Amount, token1Amount] = await checkPoolForFeeManager(feeManagerContract, async function (poolContract) {
                await feeManagerContract.connect(alice).setFeeManagerOverride(alice.address, fixedDiscountContract.address)
            })

            // No override
            expect(token0Amount.toString()).to.be.equal('99999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that the fee manager uses the default when the override is reset', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            const [token0Amount, token1Amount] = await checkPoolForFeeManager(feeManagerContract, async function (poolContract) {
                await feeManagerContract.connect(alice).setFeeManagerOverride(poolContract.address, fixedDiscountContract.address)
                await feeManagerContract.connect(alice).setFeeManagerOverride(poolContract.address, ZERO_ADDRESS)
            })

            // No override
            expect(token0Amount.toString()).to.be.equal('99999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that updating the default fee manager works', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice] = await newUsers([])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            const [token0Amount, token1Amount] = await checkPoolForFeeManager(feeManagerContract, async function (poolContract) {
                await feeManagerContract.connect(alice).setDefaultFeeManager(fixedDiscountContract.address)
            })

            expect(token0Amount.toString()).to.be.equal('49999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('fails to set the default fee manager without being the owner', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice, bob] = await newUsers([], [])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            await expect(
                feeManagerContract.connect(bob).setDefaultFeeManager(fixedDiscountContract.address)
            ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
        })

        it('fails to set the fee manager override without being the owner', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const [alice, bob] = await newUsers([], [])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            const fixedDiscountContract = await halfDiscountBlueprint.deploy()

            await expect(
                feeManagerContract.connect(bob).setFeeManagerOverride(alice.address, fixedDiscountContract.address)
            ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
        })

        it('fails to transfer ownership without being the owner', async function () {
            const [alice, bob] = await newUsers([], [])
            const feeManagerContract = await overridableFeeManagerBlueprint.deploy(noDiscountContract.address)
            console.log('Deployed fee manager')
            await feeManagerContract.transferOwnership(alice.address)

            await expect(
                feeManagerContract.connect(bob).transferOwnership(alice.address)
            ).to.be.eventually.rejectedWith('Ownable: caller is not the owner')
        })
    })

    describe('fee tiers', function () {
        const FEE_TIER_FEE = 100000 // 10%
        const FEE_TIER_TICK_SPACING = 1

        beforeEach(async function () {
            factoryContract = await factoryBlueprint.deploy()

            expect(factoryContract.address).to.be.a('string')
        })

        it('checks that the output of computeFee is used correctly (with no discount)', async function () {
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE_TIER_FEE, FEE_TIER_TICK_SPACING, (await noDiscountBlueprint.deploy()).address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )

            const [alice] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
            await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

            const mintParams = {
                token0 : TOKEN_0,
                token1 : TOKEN_1,
                fee : FEE_TIER_FEE,
                tickLower : -887272,
                tickUpper : 887272,
                amount0Desired : MONE.mul(1000),
                amount1Desired : MONE.mul(2000),
                amount0Min : 0,
                amount1Min : 0,
                recipient : deployer.address,
                deadline : await time.latest() + 1000000
            }

            await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
            await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
            await positionManagerContract.connect(deployer).mint(mintParams)

            await token0Contract.connect(alice).approve(routerContract.address, MONE)

            const swapParams = {
                tokenIn : TOKEN_0,
                tokenOut : TOKEN_1,
                fee : FEE_TIER_FEE,
                recipient : alice.address,
                deadline : await time.latest() + 1000000,
                amountIn : MONE,
                amountOutMinimum : 0,
                sqrtPriceLimitX96 : 0
            }

            await routerContract.connect(alice).exactInputSingle(swapParams)

            // Collect the fees

            const collectParams = {
                tokenId : 1,
                recipient : deployer.address,
                amount0Max : BigNumber.from(2).pow(128).sub(1),
                amount1Max : BigNumber.from(2).pow(128).sub(1)
            }

            const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
            const initialToken1Balance = await token1Contract.balanceOf(deployer.address)
            await positionManagerContract.connect(deployer).collect(collectParams)

            const finalToken0Balance = await token0Contract.balanceOf(deployer.address)
            const finalToken1Balance = await token1Contract.balanceOf(deployer.address)

            const token0Amount = finalToken0Balance.sub(initialToken0Balance)
            const token1Amount = finalToken1Balance.sub(initialToken1Balance)

            // 10^17, aka 0.1 MONE (which corresponds to the fee). The missing 1 wei is due to rounding
            expect(token0Amount.toString()).to.be.equal('99999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that the output of computeFee is used correctly (with 50% discount)', async function () {
            const halfDiscountBlueprint = await hre.ethers.getContractFactory('HalfDiscount')
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE_TIER_FEE, FEE_TIER_TICK_SPACING, (await halfDiscountBlueprint.deploy()).address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )

            const [alice] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
            await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

            const mintParams = {
                token0 : TOKEN_0,
                token1 : TOKEN_1,
                fee : FEE_TIER_FEE,
                tickLower : -887272,
                tickUpper : 887272,
                amount0Desired : MONE.mul(1000),
                amount1Desired : MONE.mul(2000),
                amount0Min : 0,
                amount1Min : 0,
                recipient : deployer.address,
                deadline : await time.latest() + 1000000
            }

            await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
            await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
            await positionManagerContract.connect(deployer).mint(mintParams)

            await token0Contract.connect(alice).approve(routerContract.address, MONE)

            const swapParams = {
                tokenIn : TOKEN_0,
                tokenOut : TOKEN_1,
                fee : FEE_TIER_FEE,
                recipient : alice.address,
                deadline : await time.latest() + 1000000,
                amountIn : MONE,
                amountOutMinimum : 0,
                sqrtPriceLimitX96 : 0
            }

            await routerContract.connect(alice).exactInputSingle(swapParams)

            // Collect the fees

            const collectParams = {
                tokenId : 1,
                recipient : deployer.address,
                amount0Max : BigNumber.from(2).pow(128).sub(1),
                amount1Max : BigNumber.from(2).pow(128).sub(1)
            }

            const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
            const initialToken1Balance = await token1Contract.balanceOf(deployer.address)
            await positionManagerContract.connect(deployer).collect(collectParams)

            const finalToken0Balance = await token0Contract.balanceOf(deployer.address)
            const finalToken1Balance = await token1Contract.balanceOf(deployer.address)

            const token0Amount = finalToken0Balance.sub(initialToken0Balance)
            const token1Amount = finalToken1Balance.sub(initialToken1Balance)

            // 5 * 10^16, aka 0.05 MONE (which corresponds to the fee). The missing 1 wei is due to rounding
            expect(token0Amount.toString()).to.be.equal('49999999999999999')
            expect(token1Amount.toString()).to.be.equal('0')
        })

        it('checks that the output of computeFee is used correctly (with 100% discount)', async function () {
            const fixedFeeBlueprint = await hre.ethers.getContractFactory('FixedFee')
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE_TIER_FEE, FEE_TIER_TICK_SPACING, (await fixedFeeBlueprint.deploy(0)).address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )

            const [alice] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
            await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

            const mintParams = {
                token0 : TOKEN_0,
                token1 : TOKEN_1,
                fee : FEE_TIER_FEE,
                tickLower : -887272,
                tickUpper : 887272,
                amount0Desired : MONE.mul(1000),
                amount1Desired : MONE.mul(2000),
                amount0Min : 0,
                amount1Min : 0,
                recipient : deployer.address,
                deadline : await time.latest() + 1000000
            }

            await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
            await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
            await positionManagerContract.connect(deployer).mint(mintParams)

            await token0Contract.connect(alice).approve(routerContract.address, MONE)

            const swapParams = {
                tokenIn : TOKEN_0,
                tokenOut : TOKEN_1,
                fee : FEE_TIER_FEE,
                recipient : alice.address,
                deadline : await time.latest() + 1000000,
                amountIn : MONE,
                amountOutMinimum : 0,
                sqrtPriceLimitX96 : 0
            }

            await routerContract.connect(alice).exactInputSingle(swapParams)

            // Collect the fees

            const collectParams = {
                tokenId : 1,
                recipient : deployer.address,
                amount0Max : BigNumber.from(2).pow(128).sub(1),
                amount1Max : BigNumber.from(2).pow(128).sub(1)
            }

            const initialToken0Balance = await token0Contract.balanceOf(deployer.address)
            const initialToken1Balance = await token1Contract.balanceOf(deployer.address)
            await positionManagerContract.connect(deployer).collect(collectParams)

            const finalToken0Balance = await token0Contract.balanceOf(deployer.address)
            const finalToken1Balance = await token1Contract.balanceOf(deployer.address)

            const token0Amount = finalToken0Balance.sub(initialToken0Balance)
            const token1Amount = finalToken1Balance.sub(initialToken1Balance)

            // No fees collected
            expect(token0Amount.toString()).to.be.equal('0')
            expect(token1Amount.toString()).to.be.equal('0')
        })


        it('fails to use a fee that is higher than the original', async function () {
            const fixedFeeBlueprint = await hre.ethers.getContractFactory('FixedFee')
            // 10.0001%
            const fixedFeeContract = await fixedFeeBlueprint.deploy(FEE_TIER_FEE + 1)
            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE_TIER_FEE, FEE_TIER_TICK_SPACING, fixedFeeContract.address)
            const contractAddress = (await tx.wait()).events[0].args.pool

            poolContract = poolContractBlueprint.attach(contractAddress)

            expect(poolContract.address).to.be.a('string')

            routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)

            positionDescriptorContract = await positionDescriptorBlueprint.deploy(
                WETH,
                hre.ethers.utils.formatBytes32String('VinuSwap Position')
            )

            positionManagerContract = await positionManagerBlueprint.deploy(
                factoryContract.address,
                WETH,
                positionDescriptorContract.address
            )

            const [alice] = await newUsers([[TOKEN_0, MONE.toString()], [TOKEN_1, MONE.toString()]])
            await poolContract.initialize(encodePriceSqrt(BigNumber.from(2)))

            const mintParams = {
                token0 : TOKEN_0,
                token1 : TOKEN_1,
                fee : FEE_TIER_FEE,
                tickLower : -887272,
                tickUpper : 887272,
                amount0Desired : MONE.mul(1000),
                amount1Desired : MONE.mul(2000),
                amount0Min : 0,
                amount1Min : 0,
                recipient : deployer.address,
                deadline : await time.latest() + 1000000
            }

            await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
            await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(3000))
            await positionManagerContract.connect(deployer).mint(mintParams)

            await token0Contract.connect(alice).approve(routerContract.address, MONE)

            const swapParams = {
                tokenIn : TOKEN_0,
                tokenOut : TOKEN_1,
                fee : FEE_TIER_FEE,
                recipient : alice.address,
                deadline : await time.latest() + 1000000,
                amountIn : MONE,
                amountOutMinimum : 0,
                sqrtPriceLimitX96 : 0
            }

            // Note: for some reason, hardhat cannot generate a stacktrace for this error
            // Still, the call fails correctly
            await expect(
                routerContract.connect(alice).exactInputSingle(swapParams)
            ).to.be.eventually.rejectedWith('IFV')
        })

        it('correctly computes the fee tier', async function () {
            // We will always assuma a base fee of 5000, i.e. 0.5%
            const discountTokenContract = await erc20Blueprint.deploy()

            const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                discountTokenContract.address,
                [100, 200, 300],
                [1000, 2000, 3000]
            )

            // No tokens: 0% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [5000], tieredDiscountContract)

            await discountTokenContract.connect(deployer).mint(99)

            // Still not enough: 0% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [5000], tieredDiscountContract)

            await discountTokenContract.connect(deployer).mint(1)
            // Now we have 100 tokens: 10% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [4500], tieredDiscountContract)

            await discountTokenContract.connect(deployer).mint(100)
            // Now we have 200 tokens: 20% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [4000], tieredDiscountContract)

            await discountTokenContract.connect(deployer).mint(100)
            // Now we have 300 tokens: 30% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [3500], tieredDiscountContract)

            await discountTokenContract.connect(deployer).mint(100)
            // Now we have 400 tokens: still 30% discount
            await checkQuery('computeFeeFor', [5000, deployer.address], [3500], tieredDiscountContract)
        })

        it('correctly handles a 0% discount', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()

            const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                discountTokenContract.address,
                [100],
                [0]
            )

            await discountTokenContract.connect(deployer).mint(150)
            await checkQuery('computeFeeFor', [5000, deployer.address], [5000], tieredDiscountContract)
        })

        it('correctly handles a 100% discount', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()

            const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                discountTokenContract.address,
                [100],
                [10000]
            )

            await discountTokenContract.connect(deployer).mint(150)
            await checkQuery('computeFeeFor', [5000, deployer.address], [0], tieredDiscountContract)
        })

        it('fails to deploy a tiered fee manager with 0 tiers', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()
            
            await expect(
                tieredDiscountBlueprint.deploy(discountTokenContract.address, [], [])
            ).to.be.rejectedWith('Thresholds must not be empty')
        })

        it('fails to deploy a tiered fee manager with different parameter lengths', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()
            
            await expect(
                tieredDiscountBlueprint.deploy(discountTokenContract.address, [100, 200], [1000])
            ).to.be.rejectedWith('Thresholds and discounts must have the same length')
        })

        it('fails to deploy a tiered fee manager with non-increasing thresholds', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()
            
            await expect(
                tieredDiscountBlueprint.deploy(discountTokenContract.address, [100, 100, 101], [100, 200, 300])
            ).to.be.rejectedWith('Thresholds must be strictly increasing')
        })

        it('fails to deploy a tiered fee manager with non-increasing discounts', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()
            
            await expect(
                tieredDiscountBlueprint.deploy(discountTokenContract.address, [100, 200, 300], [100, 100, 101])
            ).to.be.rejectedWith('Discounts must be strictly increasing')
        })

        it('fails to deploy a tiered fee manager with a discount that is too high', async function () {
            const discountTokenContract = await erc20Blueprint.deploy()
            
            // 100.01% discount
            await expect(
                tieredDiscountBlueprint.deploy(discountTokenContract.address, [100], [10001])
            ).to.be.rejectedWith('Discounts must not be higher than 100%')
        })

        describe('updating info', function () {
            it('correctly updates fee tiers', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await tieredDiscountContract.connect(deployer).updateInfo(
                    discountTokenContract.address,
                    [100],
                    [10000]
                )
    
                await checkQuery('computeFeeFor', [5000, deployer.address], [5000], tieredDiscountContract)
                await discountTokenContract.connect(deployer).mint(150)
                await checkQuery('computeFeeFor', [5000, deployer.address], [0], tieredDiscountContract)
            })

            it('correctly changes the discount token', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()
                const newDiscountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [100],
                    [10000]
                )

                await tieredDiscountContract.connect(deployer).updateInfo(
                    newDiscountTokenContract.address,
                    [100],
                    [10000]
                )
                await checkQuery('computeFeeFor', [5000, deployer.address], [5000], tieredDiscountContract)
                await newDiscountTokenContract.connect(deployer).mint(150)
                await checkQuery('computeFeeFor', [5000, deployer.address], [0], tieredDiscountContract)
            });
            it('fails to update fee tiers without being the owner', async function () {
                const [alice] = await newUsers([])
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(alice).updateInfo(
                        discountTokenContract.address,
                        [100],
                        [10000]
                    )
                ).to.be.rejectedWith('Ownable: caller is not the owner')
            })
            it('fails to update fee tiers with 0 tiers', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(deployer).updateInfo(
                        discountTokenContract.address,
                        [],
                        []
                    )
                ).to.be.rejectedWith('Thresholds must not be empty')
            })

            it('fails to update fee tiers with different parameter lengths', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(deployer).updateInfo(
                        discountTokenContract.address,
                        [100, 200],
                        [1000]
                    )
                ).to.be.rejectedWith('Thresholds and discounts must have the same length')
            })

            it('fails to update fee tiers with non-increasing thresholds', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(deployer).updateInfo(
                        discountTokenContract.address,
                        [100, 100, 101],
                        [100, 200, 300]
                    )
                ).to.be.rejectedWith('Thresholds must be strictly increasing')
            })

            it('fails to update fee tiers with non-increasing discounts', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(deployer).updateInfo(
                        discountTokenContract.address,
                        [100, 200, 300],
                        [100, 100, 101]
                    )
                ).to.be.rejectedWith('Discounts must be strictly increasing')
            })

            it('fails to update fee tiers with a discount that is too high', async function () {
                const discountTokenContract = await erc20Blueprint.deploy()

                const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
                    discountTokenContract.address,
                    [40],
                    [430]
                )

                await discountTokenContract.connect(deployer).mint(150)
                await expect(
                    tieredDiscountContract.connect(deployer).updateInfo(
                        discountTokenContract.address,
                        [100],
                        [10001]
                    )
                ).to.be.rejectedWith('Discounts must not be higher than 100%')
            })
        })


    })
})
