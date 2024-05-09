import { BigNumber } from "@ethersproject/bignumber"
import bn from 'bignumber.js'

import chai from "chai"
import chaiAsPromised from "chai-as-promised"


import hre from 'hardhat'
hre.tracer.enabled = false

import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"

import { VinuEarnLPInitializable } from '../sdk/types/contracts/VinuEarnLPInitializable'
import VinuEarnLPInitializableInfo from '../sdk/abi/vinu-earn/VinuEarnLPInitializable.json'

import VinuEarnFactoryInfo from '../sdk/abi/vinu-earn/VinuEarnFactory.json'

import VinuSwap from '../sdk/core'
import VinuEarn from '../sdk/earn'

chai.use(chaiAsPromised)
const expect = chai.expect

let deployer: any

let controllerBlueprint : hre.ethers.ContractFactory
let tieredDiscountBlueprint : hre.ethers.ContractFactory
let noDiscountBlueprint : hre.ethers.ContractFactory
let factoryBlueprint : hre.ethers.ContractFactory
let poolContractBlueprint: ethers.ContractFactory
let quoterBlueprint : hre.ethers.ContractFactory
let routerBlueprint : hre.ethers.ContractFactory
let nftDescriptorLibraryBlueprint : hre.ethers.ContractFactory
let positionDescriptorBlueprint : hre.ethers.ContractFactory
let positionManagerBlueprint : hre.ethers.ContractFactory

let erc20Blueprint : hre.ethers.ContractFactory
let noDiscountContract : any
let factoryContract : any
let poolContract: any
let quoterContract : any
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


describe('test SDK', function () {
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
        noDiscountBlueprint = await hre.ethers.getContractFactory('NoDiscount')

        factoryBlueprint = await hre.ethers.getContractFactory('VinuSwapFactory')

        poolContractBlueprint = await hre.ethers.getContractFactory('VinuSwapPool')

        quoterBlueprint = await hre.ethers.getContractFactory('VinuSwapQuoter')

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

    

    /*describe('contract deployment', function () {
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
    })*/

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

            quoterContract = await quoterBlueprint.deploy(factoryContract.address, WETH)

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

        describe('getters', function () {
            it('Non-position getters', async function() {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(342)))
                await poolContract.setFeeProtocol(4, 4)
                // TOKEN_0 and TOKEN_1 are swapped
                const sdk = await VinuSwap.create(TOKEN_1, TOKEN_0, poolContract.address, quoterContract.address, routerContract.address, positionManagerContract.address, hre.ethers.provider.getSigner())
                expect(sdk.token0Address).to.be.equal(TOKEN_0)
                expect(sdk.token1Address).to.be.equal(TOKEN_1)
                expect(await sdk.factory()).to.be.equal(factoryContract.address)
                expect(await sdk.locked()).to.be.false
                expect(await sdk.protocolShare0()).to.be.equal(0.25)
                expect(await sdk.protocolShare1()).to.be.equal(0.25)
                expect(await sdk.balance0()).to.be.equal('0')
                expect(await sdk.balance1()).to.be.equal('0')
                expect(parseFloat((await sdk.price()))).to.be.approximately(342, 0.00000000001)
            })

            it('Position getters', async function() {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                await poolContract.setFeeProtocol(4, 4)

                await token0Contract.connect(deployer).mint(MONE.mul(2000))
                await token1Contract.connect(deployer).mint(MONE.mul(2000))

                await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                console.log('Position manager:', positionManagerContract.address)

                const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, poolContract.address, quoterContract.address, routerContract.address, positionManagerContract.address, hre.ethers.provider.getSigner())
                const users = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                await sdk.connect(deployer).mint(0.001, 532, MONE.toString(), MONE.toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                

                expect(await sdk.positionAmount0('1')).to.be.equal('987883494261734200')
                expect(await sdk.positionAmount0('1')).to.be.equal(BigNumber.from(await sdk.balance0()).sub(1).toString())
                // -1 is due to approximations
                expect(await sdk.positionAmount1('1')).to.be.equal(MONE.sub(1).toString())
                expect(await sdk.positionAmount1('1')).to.be.equal(BigNumber.from(await sdk.balance1()).sub(1).toString())
                expect(await sdk.positionIsLocked('1')).to.be.false
                expect((await sdk.positionLockedUntil('1'))).to.be.null
                expect(await sdk.positionOwner('1')).to.be.equal(users[0].address)
                const [lower, upper] = await sdk.positionPriceBounds('1')
                expect(parseFloat(lower)).to.be.approximately(0.001, 0.0001)
                expect(parseFloat(upper)).to.be.approximately(532, 0.1)
                expect(await sdk.positionTokenURI('1')).to.be.not.equal('')
                expect((await sdk.positionTokensOwed('1'))[0]).to.be.equal('0')
                expect((await sdk.positionTokensOwed('1'))[1]).to.be.equal('0')
            })
        })

        describe('methods', function() {
            describe('mint', function() {
                it('mints a position', async function() {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                    await poolContract.setFeeProtocol(4, 4)

                    await token0Contract.connect(deployer).mint(MONE.mul(2000))
                    await token1Contract.connect(deployer).mint(MONE.mul(2000))

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                    await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                    console.log('Position manager:', positionManagerContract.address)

                    const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, poolContract.address, quoterContract.address, routerContract.address, positionManagerContract.address, hre.ethers.provider.getSigner())
                    const users = await newUsers([])
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, users[0].address, new Date(Date.now() + 1000000))

                    const mintQuote = await sdk.quoteMint(0.1, 532, MONE.toString(), MONE.toString())

                    expect(mintQuote[0]).to.be.equal('999999999999999999')
                    expect(mintQuote[1]).to.be.equal('714776854860176759')

                    expect(await sdk.positionAmount0('1')).to.be.equal('999999999999999999')
                    expect(await sdk.positionAmount1('1')).to.be.equal('714776854860176759')
                })
            })

            describe('positionIdsByOwner', function() {
                it('returns the position IDs owned by an address', async function() {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                    await poolContract.setFeeProtocol(4, 4)

                    await token0Contract.connect(deployer).mint(MONE.mul(2000))
                    await token1Contract.connect(deployer).mint(MONE.mul(2000))

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                    await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                    console.log('Position manager:', positionManagerContract.address)

                    // Deployer mints 1 and 2 to Alice, 3 to Bob, 4 to Alice again
                    const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, poolContract.address, quoterContract.address, routerContract.address, positionManagerContract.address, hre.ethers.provider.getSigner())

                    const [alice, bob] = await newUsers([], [])

                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, alice.address, new Date(Date.now() + 1000000))
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, alice.address, new Date(Date.now() + 1000000))
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, bob.address, new Date(Date.now() + 1000000))
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, alice.address, new Date(Date.now() + 1000000))

                    const alicePositions = await sdk.positionIdsByOwner(alice.address)
                    expect(alicePositions).to.be.an('array')
                    expect(alicePositions).to.have.lengthOf(3)
                    expect(alicePositions[0]).to.be.equal(BigNumber.from('1'))
                    expect(alicePositions[1]).to.be.equal(BigNumber.from('2'))
                    expect(alicePositions[2]).to.be.equal(BigNumber.from('4'))

                    const bobPositions = await sdk.positionIdsByOwner(bob.address)
                    expect(bobPositions).to.be.an('array')
                    expect(bobPositions).to.have.lengthOf(1)
                    expect(bobPositions[0]).to.be.equal(BigNumber.from('3'))
                })
            })

            describe('operations with liquidity', function() {
                let sdk : VinuSwap
                let alice: any
                let bob: any
                let charlie: any
                beforeEach(async function() {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                    await poolContract.setFeeProtocol(4, 4)

                    await token0Contract.connect(deployer).mint(MONE.mul(2000))
                    await token1Contract.connect(deployer).mint(MONE.mul(2000))

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                    await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                    console.log('Position manager:', positionManagerContract.address)

                    sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, poolContract.address, quoterContract.address, routerContract.address, positionManagerContract.address, hre.ethers.provider.getSigner())
                    const users = await newUsers([], [], [])
                    alice = users[0]
                    bob = users[1]
                    charlie = users[2]
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, charlie.address, new Date(Date.now() + 1000000))
                })

                describe('swap', function() {
                    describe('swapExactInput', function() {
                        it('peforms a zero-one exact input swap', async function() {
                            await token0Contract.connect(alice).mint(MONE.div(10))
                            await token0Contract.connect(alice).approve(routerContract.address, MONE.div(10))
    
                            const amountOut = await sdk.connect(alice).quoteExactInput(TOKEN_0, TOKEN_1, MONE.div(10).toString())
    
                            expect(amountOut).to.be.equal('91266728437306413')
    
                            await sdk.connect(alice).swapExactInput(TOKEN_0, TOKEN_1, MONE.div(10).toString(), '0', bob.address, new Date(Date.now() + 1000000))
                            expect(await token0Contract.balanceOf(alice.address)).to.be.equal(
                                '0' // All the input tokens are spent
                            )
                            expect(await token1Contract.balanceOf(bob.address)).to.be.equal(
                                '91266728437306413' // All the output tokens are received
                            )
                        })

                        it('peforms a one-zero exact input swap', async function() {
                            await token1Contract.connect(alice).mint(MONE.div(10))
                            await token1Contract.connect(alice).approve(routerContract.address, MONE.div(10))
    
                            const amountOut = await sdk.connect(alice).quoteExactInput(TOKEN_1, TOKEN_0, MONE.div(10).toString())
    
                            expect(amountOut).to.be.equal('91266728437306413')
    
                            await sdk.connect(alice).swapExactInput(TOKEN_1, TOKEN_0, MONE.div(10).toString(), '0', bob.address, new Date(Date.now() + 1000000))
                            expect(await token1Contract.balanceOf(alice.address)).to.be.equal(
                                '0' // All the input tokens are spent
                            )
                            expect(await token0Contract.balanceOf(bob.address)).to.be.equal(
                                '91266728437306413' // All the output tokens are received
                            )
                        })
                    })

                    describe('swapExactOutput', function() {
                        it('peforms a zero-one exact output swap', async function() {
                            await token0Contract.connect(alice).mint(MONE.div(10))
                            await token0Contract.connect(alice).approve(routerContract.address, MONE.div(10))
    
                            const amountIn = await sdk.connect(alice).quoteExactOutput(TOKEN_0, TOKEN_1, '91266728437306413')
    
                            expect(amountIn).to.be.equal('99999999999999999')
    
                            await sdk.connect(alice).swapExactOutput(TOKEN_0, TOKEN_1, '91266728437306413', MONE.div(10).toString(), bob.address, new Date(Date.now() + 1000000))
                            expect(await token0Contract.balanceOf(alice.address)).to.be.equal(
                                '1' // All the input tokens are spent (except for 1 wei due to approximations)
                            )
                            expect(await token1Contract.balanceOf(bob.address)).to.be.equal(
                                '91266728437306413' // All the output tokens are received (except for 1 wei due to approximations)
                            )
                        })

                        it('peforms a one-zero exact output swap', async function() {
                            await token1Contract.connect(alice).mint(MONE.div(10))
                            await token1Contract.connect(alice).approve(routerContract.address, MONE.div(10))
    
                            const amountIn = await sdk.connect(alice).quoteExactOutput(TOKEN_1, TOKEN_0, '91266728437306413')
    
                            expect(amountIn).to.be.equal(MONE.div(10).toString())
    
                            await sdk.connect(alice).swapExactOutput(TOKEN_1, TOKEN_0, '91266728437306413', MONE.div(10).toString(), bob.address, new Date(Date.now() + 1000000))
                            expect(await token1Contract.balanceOf(alice.address)).to.be.equal(
                                '0' // All the input tokens are spent
                            )
                            expect(await token0Contract.balanceOf(bob.address)).to.be.equal(
                                '91266728437306413' // All the output tokens are received
                            )
                        })
                    })
                })

                describe('increaseLiquidity', function() {
                    it('increases liquidity', async function() {
                        await token0Contract.connect(alice).mint(MONE.div(10))
                        await token0Contract.connect(alice).approve(positionManagerContract.address, MONE.div(10))
                        await token1Contract.connect(alice).mint(MONE.div(10))
                        await token1Contract.connect(alice).approve(positionManagerContract.address, MONE.div(10))

                        expect(await sdk.positionAmount0('1')).to.be.equal('999999999999999999')
                        expect(await sdk.positionAmount1('1')).to.be.equal('714776854860176759')

                        const quote = await sdk.quoteIncreaseLiquidity('1', MONE.div(10).toString(), MONE.div(10).toString())
                        expect(quote[0]).to.be.equal('99999999999999999')
                        expect(quote[1]).to.be.equal('71477685486017676')

                        await sdk.connect(alice).increaseLiquidity('1', MONE.div(10).toString(), MONE.div(10).toString(), '0', '0', new Date(Date.now() + 1000000))

                        // 999999999999999999 (~1 ETH) + 99999999999999999 (~0.1 ETH) = 1099999999999999998 (~1.1 ETH)
                        expect(await sdk.positionAmount0('1')).to.be.equal('1099999999999999998')
                        // 714776854860176759 (~0.714 ETH) + 71477685486017676 (~0.0714 ETH) = 786254540346194435 (~0.786 ETH)
                        expect(await sdk.positionAmount1('1')).to.be.equal('786254540346194435')
                    })
                })

                describe('decreaseLiquidity', function() {
                    it('decreases liquidity', async function() {
                        expect(await sdk.positionAmount0('1')).to.be.equal('999999999999999999')
                        expect(await sdk.positionAmount1('1')).to.be.equal('714776854860176759')

                        const liquidityReduction = (await sdk.positionLiquidity('1')).div(10)

                        const quote = await sdk.quoteDecreaseLiquidity('1', liquidityReduction.toString())
                        expect(quote[0]).to.be.equal('100000000000000000')
                        expect(quote[1]).to.be.equal('71477685486017676')

                        // Only Charlie & his operators can decrease liquidity
                        await sdk.connect(charlie).decreaseLiquidity('1', liquidityReduction.toString(), '0', '0', new Date(Date.now() + 1000000))

                        // 999999999999999999 (~1 ETH) - 100000000000000000 (~0.1 ETH) = 899999999999999999 (~0.9 ETH)
                        expect(await sdk.positionAmount0('1')).to.be.equal('899999999999999999')
                        // 714776854860176759 (~0.715 ETH) - 71477685486017676 (~0.0715 ETH) = 643299169374159083 (~0.643 ETH)
                        expect(await sdk.positionAmount1('1')).to.be.equal('643299169374159083')
                    })
                })

                describe('burn', function() {
                    it('burns a position', async function() {
                        expect(await sdk.positionAmount0('1')).to.be.equal('999999999999999999')
                        expect(await sdk.positionAmount1('1')).to.be.equal('714776854860176759')

                        const liquidity = await sdk.positionLiquidity('1')

                        await sdk.connect(charlie).decreaseLiquidity('1', liquidity.toString(), '0', '0', new Date(Date.now() + 1000000))

                        await sdk.connect(charlie).collect('1', charlie.address, MONE.toString(), MONE.toString())

                        console.log('Current liquidity:', await sdk.positionLiquidity('1'))

                        await sdk.connect(charlie).burn('1')

                        // Check that Charlie received the tokens
                        expect(await token0Contract.balanceOf(charlie.address)).to.be.equal('999999999999999999')
                        expect(await token1Contract.balanceOf(charlie.address)).to.be.equal('714776854860176759')
                    })
                })
                
                describe('lock', function() {
                    it('locks a position', async function() {
                        const currentEpoch = await time.latest()
                        const lockedUntil = new Date((currentEpoch + 1000) * 1000)
                        await sdk.connect(charlie).lock('1', lockedUntil, new Date(Date.now() + 1000000))
                        expect(await sdk.positionIsLocked('1')).to.be.true
                        expect((await sdk.positionLockedUntil('1')).getTime()).to.be.equal(lockedUntil.getTime())
                    })
                })

                describe('collect', function() {
                    it('collects tokens owed', async function() {
                        // Start with a swap
                        await token0Contract.connect(alice).mint(MONE.div(10))
                        await token0Contract.connect(alice).approve(routerContract.address, MONE.div(10))
                        await sdk.connect(alice).swapExactInput(TOKEN_0, TOKEN_1, MONE.div(10).toString(), '0', bob.address, new Date(Date.now() + 1000000))
                        
                        console.log('Swapped.')
                        console.log('Pool address:', poolContract.address)


                        expect((await sdk.positionTokensOwed('1'))[0]).to.be.equal('1875000000001')
                        expect((await sdk.positionTokensOwed('1'))[1]).to.be.equal('0')

                        await sdk.connect(charlie).collect('1', charlie.address, MONE.mul(10).toString(), MONE.mul(10).toString())

                        expect((await sdk.positionTokensOwed('1'))[0]).to.be.equal('0')
                        expect((await sdk.positionTokensOwed('1'))[1]).to.be.equal('0')

                        expect(await token0Contract.balanceOf(charlie.address)).to.be.equal('1875000000001')
                        expect(await token1Contract.balanceOf(charlie.address)).to.be.equal('0')

                    })
                })

                describe('collectProtocol', function() {
                    it('collects protocol fees', async function() {
                        const initialDeployerBalance0 = await token0Contract.balanceOf(deployer.address)
                        const initialDeployerBalance1 = await token1Contract.balanceOf(deployer.address)

                        // Start with a swap
                        await token0Contract.connect(alice).mint(MONE.div(10))
                        await token0Contract.connect(alice).approve(routerContract.address, MONE.div(10))
                        await sdk.connect(alice).swapExactInput(TOKEN_0, TOKEN_1, MONE.div(10).toString(), '0', bob.address, new Date(Date.now() + 1000000))
                        
                        console.log('Swapped.')

                        const protocolFees = await sdk.availableProtocolFees()
                        expect(protocolFees[0]).to.be.equal('624999999999')
                        expect(protocolFees[1]).to.be.equal('0')

                        await sdk.connect(deployer).collectProtocol(deployer.address, '624999999999', '0')

                        // Due to Uniswaps's gas savings hacks, if you try to collect exactly the amount
                        // of protocol fees, you will get 1 wei less
                        expect((await token0Contract.balanceOf(deployer.address)).sub(initialDeployerBalance0)).to.be.equal('624999999998')
                        expect((await token1Contract.balanceOf(deployer.address)).sub(initialDeployerBalance1)).to.be.equal('0')
                    })
                })

                describe('VinuEarn methods', function() {
                    let vinuEarnContract : VinuEarnLPInitializable
                    let earnSdk : VinuEarn
                    beforeEach(async function() {
                        const vinuEarnFactoryBlueprint = new ethers.ContractFactory(
                            VinuEarnFactoryInfo.abi,
                            VinuEarnFactoryInfo.bytecode,
                            deployer
                        )
                        const vinuEarnFactoryContract = await vinuEarnFactoryBlueprint.deploy()

                        const tx = await vinuEarnFactoryContract.deployLpPool(
                            positionManagerContract.address,
                            TOKEN_0,
                            21,
                            345,
                            4535345,
                            0,
                            deployer.address
                        )
                        const receipt = await tx.wait()
                        const vinuEarnAddress = receipt.events[2].args.vinuEarnLp
                        // @ts-ignore
                        vinuEarnContract = new ethers.Contract(vinuEarnAddress, VinuEarnLPInitializableInfo.abi, deployer) as VinuEarnLPInitializable

                        earnSdk = new VinuEarn(vinuEarnAddress, deployer)
                    })

                    describe('deposit', function() {
                        it('deposits', async function() {
                            await positionManagerContract.connect(charlie).approve(vinuEarnContract.address, '1')
                            await earnSdk.connect(charlie).deposit('1')
                            expect(await vinuEarnContract.nftOwner('1')).to.be.equal(charlie.address)
                        })
                    })

                    describe('withdraw', function() {
                        it('withdraws', async function() {
                            await positionManagerContract.connect(charlie).approve(vinuEarnContract.address, '1')
                            await earnSdk.connect(charlie).deposit('1')
                            await earnSdk.connect(charlie).withdraw('1')
                            expect(await vinuEarnContract.nftOwner('1')).to.be.equal(ZERO_ADDRESS)
                        })
                    })

                    describe.only('collectReward', function() {
                        it('collects the reward', async function() {
                            await positionManagerContract.connect(charlie).approve(vinuEarnContract.address, '1')
                            await earnSdk.connect(charlie).deposit('1')
                            await time.increase(1000)
                            const pendingReward = await vinuEarnContract.pendingReward(charlie.address)
                            expect(pendingReward).to.be.equal('10')
                            await earnSdk.connect(charlie).collectReward()
                            expect(await vinuEarnContract.nftOwner('1')).to.be.equal(charlie.address)
                        })
                    })

                    describe('collectRevenue', function() {
                        it('collects revenue', async function() {
                            await positionManagerContract.connect(charlie).approve(vinuEarnContract.address, '1')
                            await earnSdk.connect(charlie).deposit('1')
                            await earnSdk.connect(charlie).collectRevenue('1', MONE, MONE)
                            expect(await vinuEarnContract.nftOwner('1')).to.be.equal(charlie.address)
                        })
                    })
                })
            })
        })
    })

    
})