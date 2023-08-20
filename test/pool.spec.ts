import { BigNumber } from "@ethersproject/bignumber"
import bn from 'bignumber.js'

import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { isNumberObject } from "util/types"


import hre from 'hardhat'
hre.tracer.enabled = false

import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { splitSignature } from 'ethers/lib/utils'

chai.use(chaiAsPromised)
const expect = chai.expect

let deployer: any

let factoryBlueprint : hre.ethers.ContractFactory
let contractBlueprint: ethers.ContractFactory
let routerBlueprint : hre.ethers.ContractFactory
let nftDescriptorLibraryBlueprint : hre.ethers.ContractFactory
let positionDescriptorBlueprint : hre.ethers.ContractFactory
let positionManagerBlueprint : hre.ethers.ContractFactory

let factoryContract : any
let contract: any
let routerContract : any
let nftDescriptorLibraryContract : any
let positionDescriptorContract : any
let positionManagerContract : any

let mnemonicCounter = 1

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const MONE = BigNumber.from('1000000000000000000') //10**18
// TODO: Choose adequate values
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
    wallet: Wallet,
    positionManager: NonfungiblePositionManager,
    spender: string,
    tokenId: BigNumberish,
    deadline: BigNumberish = constants.MaxUint256,
    permitConfig?: { nonce?: BigNumberish; name?: string; chainId?: number; version?: string }
  ): Promise<Signature> {
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

const checkEvents = async (tx, correct : Array<Object>, referenceContract : any | undefined = undefined) => {
    if (!referenceContract) {
        referenceContract = contract
    }
    const receipt = await tx.wait()

    let i = 0
    for (const event of receipt.events) {
        if (event.address == referenceContract.address) {

            const result = event.args
            
            const correctItem = {}
            const parsedResult = {}
            for (const key of Object.keys(correct[i])) {
                if (!isNumberObject(key)) {
                    correctItem[key] = String(correct[i][key])
                    parsedResult[key] = String(result[key])

                }
            }
            expect(parsedResult).to.be.deep.equal(correctItem)

            i++
        }
    }
}

const checkQuery = async (methodName : string, params : Array<any>, expected : Array<any>, referenceContract : ethers.Contract | undefined = undefined) => {
    if (!referenceContract) {
        referenceContract = contract
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
        const currentContracts = [contract, factoryContract]

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


describe('test BasePool', function () {
    before(async function() {
        this.timeout(0)
        //provider = await vite.newProvider('http://127.0.0.1:23456')
        //deployer = vite.newAccount(config.networks.local.mnemonic, 0, provider)

        const [a] = await ethers.getSigners()
        deployer = a
        console.log('Signer created.')

        const erc20Blueprint = await hre.ethers.getContractFactory('MockERC20')

        token0Contract = await erc20Blueprint.deploy()
        TOKEN_0 = token0Contract.address

        token1Contract = await erc20Blueprint.deploy()
        TOKEN_1 = token1Contract.address

        const weth9Blueprint = await hre.ethers.getContractFactory('WETH9')
        const weth9Contract = await weth9Blueprint.deploy()
        WETH = weth9Contract.address

        //await transpileContract('contracts/BasePool.solpp')
        //await transpileContract('contracts/Controller.solpp')
        console.log('Deployed ERC20s.')


        await token0Contract.connect(deployer).mint('1000000')
        await token1Contract.connect(deployer).mint('1000000')

        console.log('Compiling contracts...')

        const poolInitHelperBlueprint = await hre.ethers.getContractFactory('PoolInitHelper')
        const poolInitHelperContract = await poolInitHelperBlueprint.deploy()
        console.log('Init code hash:', await poolInitHelperContract.getInitCodeHash())

        factoryBlueprint = await hre.ethers.getContractFactory('VinuSwapFactory')

        contractBlueprint = await hre.ethers.getContractFactory('VinuSwapPool')

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

            // TODO: What are the parameters?
            await factoryContract.enableFeeAmount(FEE, TICK_SPACING)


            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE)
            const contractAddress = (await tx.wait()).events[0].args.pool
            console.log('Contract address: ', contractAddress)

            contract = contractBlueprint.attach(contractAddress)

            expect(contract.address).to.be.a('string')

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
            console.log('Deployed position manager.')
        })
    })

    describe('contract execution', function () {
        beforeEach(async function () {
            factoryContract = await factoryBlueprint.deploy()

            expect(factoryContract.address).to.be.a('string')

            // TODO: What are the parameters?
            await factoryContract.enableFeeAmount(FEE, TICK_SPACING)


            const tx = await factoryContract.createPool(TOKEN_0, TOKEN_1, FEE)
            const contractAddress = (await tx.wait()).events[0].args.pool
            console.log('Contract address: ', contractAddress)

            contract = contractBlueprint.attach(contractAddress)

            expect(contract.address).to.be.a('string')

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
            console.log('Deployed position manager.')
        })

        describe('sanity checks', function () {
            // These tests do not cover new features, they are only meant
            // to make sure that the contract is working as usual
            describe('liquidity', function () {
                it('deposits liquidity', async function () {
                    await contract.initialize(encodePriceSqrt(BigNumber.from(1)))

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
                    await contract.initialize(encodePriceSqrt(BigNumber.from(1)))

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
                    await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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

                    await checkQuery('liquidity', [], [1414], contract)
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

                    await checkQuery('liquidity', [], [707], contract)
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
                    await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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

                    await checkQuery('liquidity', [], [1414], contract)
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

                    await checkQuery('liquidity', [], [0], contract)
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
                    await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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

                    await checkQuery('liquidity', [], [1414], contract)
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

                    await checkQuery('liquidity', [], [1414], contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)
                    await checkQuery('balanceOf', [alice.address], [0], token0Contract)
                    await checkQuery('balanceOf', [alice.address], [100 + 171], token1Contract)
                })
                it('swaps with exact output', async function () {
                    const [alice] = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                    await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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

                    await checkQuery('liquidity', [], [1414], contract)
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

                    await checkQuery('liquidity', [], [1414], contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken0Balance.sub(1000)], token0Contract)
                    await checkQuery('balanceOf', [deployer.address], [initialToken1Balance.sub(2000)], token1Contract)
                    await checkQuery('balanceOf', [alice.address], [0], token0Contract)
                    await checkQuery('balanceOf', [alice.address], [100 + 171], token1Contract)
                })
            })
        })

        describe.only('locking', function () {
            it('locks a position', async function () {
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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
                await contract.initialize(encodePriceSqrt(BigNumber.from(2)))

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

        describe('setting protocol fees', function () {
            it('sets the protocol fee', async function () {
                // TODO
                // The fee breakdown is:
                // Total fee: 0.25%
                //   0.20% goes to LPs
                //   0.05% (aka 1/5th of the fee) goes to the protocol
                //     0.01% goes to the treasury
                //     0.02% goes to VINU Buy & Burn
                //     0.02% goes to VC Buy & Burn
            })
            it('fails to set the protocol fee if not the owner', async function () {
                // TODO
            })
            it('fails to set the protocol fee if the fee is too high', async function () {
                // TODO
            })
        })

        describe('fee tiers', function () {
            
        })

    })
})
