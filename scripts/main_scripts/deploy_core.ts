import fs from 'fs'
import { ethers } from "hardhat"

async function deployCommonContracts(accounts, shares, discountToken, discountThresholds, discounts, WETH) {
    // Steps:
    // 1. Deploy Controller
    // 2. Deploy VinuSwapFactory
    // 3. Transfer ownership of VinuSwapFactory to Controller
    // 4. Deploy SwapRouter
    // 5. Deploy NonfungibleTokenPositionDescriptor
    // 6. Deploy NonfungiblePositionManager
    // 7. Deploy TieredDiscount
    // 8. Deploy VinuSwapQuoter
    
    const [deployer] = await ethers.getSigners()

    console.log('Deployer:', deployer.address)
    console.log('Deployer balance:', (await deployer.getBalance()).toString())

    // 1. Deploy Controller
    const controllerBlueprint = await ethers.getContractFactory('Controller')
    const controllerContract = await controllerBlueprint.deploy(
        accounts,
        shares
    )
    console.log('Deployed controller to:', controllerContract.address)

    // 2. Deploy VinuSwapFactory
    const factoryBlueprint = await ethers.getContractFactory('VinuSwapFactory')
    const factoryContract = await factoryBlueprint.deploy()
    console.log('Deployed factory to:', factoryContract.address)

    // 3. Transfer ownership of VinuSwapFactory to Controller
    await factoryContract.connect(deployer).setOwner(controllerContract.address)

    // 4. Deploy SwapRouter
    const routerBlueprint = await ethers.getContractFactory('SwapRouter')
    const routerContract = await routerBlueprint.deploy(factoryContract.address, WETH)
    console.log('Deployed router to:', routerContract.address)

    // 5. Deploy NonfungibleTokenPositionDescriptor

    // 5.1 Deploy NFTDescriptor
    const nftDescriptorLibraryBlueprint = await ethers.getContractFactory('NFTDescriptor')
    const nftDescriptorLibraryContract = await nftDescriptorLibraryBlueprint.deploy()
    
    // 5.2 Deploy NonfungibleTokenPositionDescriptor
    const positionDescriptorBlueprint = await ethers.getContractFactory('NonfungibleTokenPositionDescriptor', {
        libraries: {
            NFTDescriptor: nftDescriptorLibraryContract.address
        }
    })
    const positionDescriptorContract = await positionDescriptorBlueprint.deploy(
        WETH,
        ethers.utils.formatBytes32String('VinuSwap Position')
    )
    console.log('Deployed position descriptor to:', positionDescriptorContract.address)

    // 6. Deploy NonfungiblePositionManager
    const positionManagerBlueprint = await ethers.getContractFactory('NonfungiblePositionManager')
    const positionManagerContract = await positionManagerBlueprint.deploy(
        factoryContract.address,
        WETH,
        positionDescriptorContract.address
    )
    console.log('Deployed position manager to:', positionManagerContract.address)

    // 7. Deploy TieredDiscount
    const tieredDiscountBlueprint = await ethers.getContractFactory('TieredDiscount')
    const tieredDiscountContract = await tieredDiscountBlueprint.deploy(
        discountToken,
        discountThresholds,
        discounts
    )
    console.log('Deployed tiered discount to:', tieredDiscountContract.address)

    // 8. Deploy VinuSwapQuoter
    const quoterBlueprint = await ethers.getContractFactory('VinuSwapQuoter')
    const quoterContract = await quoterBlueprint.deploy(factoryContract.address, WETH)

    console.log('Deployed quoter to:', quoterContract.address)

    console.log('Deployed common contracts.')

    return {
        controller: controllerContract.address,
        factory: factoryContract.address,
        router: routerContract.address,
        positionDescriptor: positionDescriptorContract.address,
        positionManager: positionManagerContract.address,
        tieredDiscount: tieredDiscountContract.address,
        quoter: quoterContract.address
    }
}

function loadJsonFile(path) {
    const data = fs.readFileSync(path, 'utf8');
    return JSON.parse(data);
}

function saveJsonFile(path, data) {
    const dataStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(path, dataStr, 'utf8');
}

function parseLetterNumber(str) {
    str = str.replace('k', '000');
    str = str.replace('M', '000000');
    str = str.replace('B', '000000000');
    str = str.replace('T', '000000000000');
    return str
}

function parseTokenAmount(amount, tokenId, tokenInfos) {
    const tokenInfo = tokenInfos[tokenId];
    const tokenAmount = ethers.utils.parseUnits(amount, tokenInfo.decimals);
    return tokenAmount;
}

async function main() {
    const config = loadJsonFile('deployment_config.json');

    const controllerAccounts = config.controllers.map(controllerPair => controllerPair[0]);
    const controllerShares = config.controllers.map(controllerPair => controllerPair[1]);

    const discountThresholds = config.discounts.map(
        thresholdPair => parseTokenAmount(parseLetterNumber(thresholdPair[0]), config.discountToken, config.tokens).toString()
    );
    const discounts = config.discounts.map(
        discountPair => (discountPair[1] * 10000).toFixed(0)
    );

    console.log('Controller accounts:', controllerAccounts);
    console.log('Controller shares:', controllerShares);
    console.log('Discount thresholds:', discountThresholds);
    console.log('Discounts:', discounts);


    const results = await deployCommonContracts(
        controllerAccounts,
        controllerShares,
        config.tokens[config.discountToken].address,
        discountThresholds,
        discounts,
        config.tokens.wvc.address
    );

    config.commonContracts = results;

    saveJsonFile('deployment_config.json', config);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).then(() => process.exit());