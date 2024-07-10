import fs from 'fs'
import { ethers } from "hardhat"

async function deployQuoter(factoryAddress, WETH) {
    const [deployer] = await ethers.getSigners()

    console.log('Deployer:', deployer.address)
    console.log('Deployer balance:', (await deployer.getBalance()).toString())

    const quoterBlueprint = await ethers.getContractFactory('VinuSwapQuoter')
    const quoterContract = await quoterBlueprint.deploy(factoryAddress, WETH)

    console.log('Deployed quoter to:', quoterContract.address)

    return quoterContract

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

    const quoter = await deployQuoter(config.commonContracts.factory, config.tokens.wvc.address);

    config.commonContracts.quoter = quoter.address;

    saveJsonFile('deployment_config.json', config);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).then(() => process.exit());