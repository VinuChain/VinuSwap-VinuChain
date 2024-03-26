import { BigNumber } from "@ethersproject/bignumber"
import bn from 'bignumber.js'

import chai from "chai"
import chaiAsPromised from "chai-as-promised"


import hre from 'hardhat'
hre.tracer.enabled = false

import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { splitSignature } from 'ethers/lib/utils'

import VinuSwap from '../sdk/core'

chai.use(chaiAsPromised)
const expect = chai.expect

let deployer: any

let controllerBlueprint : hre.ethers.ContractFactory
let tieredDiscountBlueprint : hre.ethers.ContractFactory
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


describe.only('test SDK', function () {
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
                await poolContract.setFeeProtocol(4, 5)
                const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, FEE, poolContract.address, routerContract.address, positionManagerContract.address)
                expect(sdk.token0).to.be.equal(TOKEN_0)
                expect(sdk.token1).to.be.equal(TOKEN_1)
                expect(await sdk.factory()).to.be.equal(factoryContract.address)
                expect(await sdk.unlocked()).to.be.true
                expect(await sdk.protocolShare0()).to.be.equal(0.25)
                expect(await sdk.protocolShare1()).to.be.equal(0.2)
                expect(await sdk.balance0()).to.be.equal('0')
                expect(await sdk.balance1()).to.be.equal('0')
                expect(parseFloat((await sdk.price()))).to.be.approximately(342, 0.00000000001)
            })

            it('Position getters', async function() {
                await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                await poolContract.setFeeProtocol(4, 5)

                await token0Contract.connect(deployer).mint(MONE.mul(2000))
                await token1Contract.connect(deployer).mint(MONE.mul(2000))

                await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                console.log('Position manager:', positionManagerContract.address)

                const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, FEE, poolContract.address, routerContract.address, positionManagerContract.address)
                const users = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                await sdk.connect(deployer).mint(0.001, 532, MONE.toString(), MONE.toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                

                expect(await sdk.positionAmount0('1')).to.be.equal('987883494261734200')
                expect(await sdk.positionAmount0('1')).to.be.equal(BigNumber.from(await sdk.balance0()).sub(1).toString())
                // -1 is due to approximations
                expect(await sdk.positionAmount1('1')).to.be.equal(MONE.sub(1).toString())
                expect(await sdk.positionAmount1('1')).to.be.equal(BigNumber.from(await sdk.balance1()).sub(1).toString())
                expect(await sdk.positionIsLocked('1')).to.be.false
                expect((await sdk.positionLockedUntil('1')).getTime()).to.be.equal(0)
                expect(await sdk.positionOwner('1')).to.be.equal(users[0].address)
                const [lower, upper] = await sdk.positionPriceBounds('1')
                expect(parseFloat(lower)).to.be.approximately(0.001, 0.0001)
                expect(parseFloat(upper)).to.be.approximately(532, 0.1)
                expect(await sdk.positionTokenURI('1')).to.be.not.equal('')
                expect(await sdk.positionTokensOwed0('1')).to.be.equal('0')
                expect(await sdk.positionTokensOwed1('1')).to.be.equal('0')

                // TODO: Rimpiazzare la matematica mia con la matematica di Uniswap esatta (anche se l'errore è 1 wei)
            })
        })

        describe('methods', function() {
            describe('mint', function() {
                it('mints a position', async function() {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                    await poolContract.setFeeProtocol(4, 5)

                    await token0Contract.connect(deployer).mint(MONE.mul(2000))
                    await token1Contract.connect(deployer).mint(MONE.mul(2000))

                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(1000))

                    await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))
                    await token1Contract.connect(deployer).approve(routerContract.address, MONE.mul(1000))

                    console.log('Position manager:', positionManagerContract.address)

                    const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, FEE, poolContract.address, routerContract.address, positionManagerContract.address)
                    const users = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                    //await sdk.connect(deployer).mint(21, 532, MONE.div(10).toString(), MONE.div(10).toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                    //await sdk.connect(deployer).mint(21, 532, MONE.div(10).toString(), MONE.div(10).toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                    
                    //await sdk.liquidity(1)


                    /*await sdk.connect(deployer).swapExactInput(TOKEN_0, TOKEN_1, MONE.div(10).toString(), '0', users[0].address, new Date(Date.now() + 1000000))
                    
                    await sdk.connect(deployer).mint(0.001, 532, MONE.div(10).toString(), MONE.div(10).toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                    await sdk.connect(deployer).mint(0.001, 532, MONE.div(10).toString(), MONE.div(10).toString(), 0.999, users[0].address, new Date(Date.now() + 1000000))
                    await checkQuery('balanceOf', [users[0].address], [3], positionManagerContract)
                    */
                })
            })

            describe('operations with liquidity', function() {
                beforeEach(async function() {
                    await poolContract.initialize(encodePriceSqrt(BigNumber.from(1)))
                    await poolContract.setFeeProtocol(4, 5)

                    await token0Contract.connect(deployer).mint(MONE.mul(4000))
                    await token0Contract.connect(deployer).approve(positionManagerContract.address, MONE.mul(2000))
                    await token0Contract.connect(deployer).approve(routerContract.address, MONE.mul(2000))

                    console.log('Position manager:', positionManagerContract.address)

                    const sdk = await VinuSwap.create(TOKEN_0, TOKEN_1, FEE, poolContract.address, routerContract.address, positionManagerContract.address)
                    const users = await newUsers([[TOKEN_0, 100], [TOKEN_1, 100]])
                    await sdk.connect(deployer).mint(0.1, 532, MONE.toString(), MONE.toString(), 0, users[0].address, new Date(Date.now() + 1000000))
                })

                /*it('locks a position', async function() {
                })*/
            })
        })
    })

    
})