import fs from 'fs'
import { ethers } from "hardhat"

import bn from 'bignumber.js'

const TICK_SPACINGS = {
    low : 10,
    medium : 60,
    high: 200
}

const FixedMathBN = bn.clone({ DECIMAL_PLACES: 40, EXPONENTIAL_AT: 999999 });

async function queryPrices(coins) {
    const coinGeckoToInternalId: { [key: string]: string } = {};
  
    for (const [internalId, coin] of Object.entries(coins)) {
      coinGeckoToInternalId[coin.coingeckoId] = internalId;
    }

    console.log('Coingecko to internal ID:', coinGeckoToInternalId)
  
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${Object.keys(
        coinGeckoToInternalId,
      ).join(',')}&vs_currencies=usd`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-cg-demo-api-key': 'CG-seSU6PMVH191jWsXYYWnbHW8',
        },
      },
    );
    const data = await response.json();
  
    const results: { [key: string]: string } = {};
  
    for (const [key, value] of Object.entries(data)) {
      results[coinGeckoToInternalId[key]] = value?.usd?.toString();
    }
  
    console.log('Prices:', results);
  
    return results;
}

async function deployPool (controllerContract, factoryContract, tokenA, tokenB, fee, protocolFee, tickSpacing, discountContract, weiTokenAUsd, weiTokenBUsd) {
    console.log('Deploying a pool with the following information:')
    console.log('Controller:', controllerContract)
    console.log('Factory:', factoryContract)
    console.log('Token A:', tokenA)
    console.log('Token B:', tokenB)
    console.log('Fee:', fee)
    console.log('Protocol Fee:', protocolFee)
    console.log('Tick Spacing:', tickSpacing)
    console.log('Discount Contract:', discountContract)
    console.log('Wei Token A USD:', weiTokenAUsd.toString())
    console.log('Wei Token B USD:', weiTokenBUsd.toString())
    
    const controllerContractBlueprint = await ethers.getContractFactory('Controller')
    controllerContract = controllerContractBlueprint.attach(controllerContract)

    const factoryContractBlueprint = await ethers.getContractFactory('VinuSwapFactory')
    factoryContract = factoryContractBlueprint.attach(factoryContract)

    const discountContractBlueprint = await ethers.getContractFactory('TieredDiscount')
    discountContract = discountContractBlueprint.attach(discountContract)
    
    // 1. Deploy VinuSwapPool by calling createPool on Controller
    // 2. Initialize the pool by calling initialize on Controller
    // 3. Set the protocol fee on the pool by calling setFeeProtocol on Controller

    // 1. Deploy VinuSwapPool by calling createPool on Controller
    const tx = await controllerContract.createPool(factoryContract.address, tokenA, tokenB, fee, tickSpacing, discountContract.address)
    const receipt = await tx.wait()
    const contractAddress = receipt.events[1].args.pool

    const poolContractBlueprint = await ethers.getContractFactory('VinuSwapPool')
    const poolContract = poolContractBlueprint.attach(contractAddress)

    console.log('Pool deployed to', poolContract.address)

    const token0 = await poolContract.token0()
    const token1 = await poolContract.token1()

    // The ratio is price of token1 / price of token0

    let weiToken0USd, weiToken1USd;

    if (token0 == tokenA && token1 == tokenB) {
        weiToken0USd = weiTokenAUsd
        weiToken1USd = weiTokenBUsd
        console.log('Token A and B are correct.')
    } else if (token0 == tokenB && token1 == tokenA) {
        weiToken0USd = weiTokenBUsd
        weiToken1USd = weiTokenAUsd
        console.log('Token A and B are reversed.')
    } else {
        throw new Error('Token A and B are incorrect.')
    }

    //const initialRatio = weiToken1USd.dividedBy(weiToken0USd);
    const initialRatio = weiToken0USd.dividedBy(weiToken1USd);

    console.log('Initial ratio:', initialRatio.toString())

    // 2. Initialize the pool by calling initialize on Controller
    const tx2 = await controllerContract.initialize(poolContract.address, encodePrice(initialRatio.toString()))
    await tx2.wait()

    console.log('Pool initialized.')

    // 3. Set the protocol fee of the pool by calling setFeeProtocol on Controller
    const tx3 = await controllerContract.setFeeProtocol(poolContract.address, protocolFee, protocolFee)
    await tx3.wait()

    console.log('Deployed pool.')

    return poolContract
}

function loadJsonFile(path) {
    const data = fs.readFileSync(path, 'utf8');
    return JSON.parse(data);
}

function saveJsonFile(path, data) {
    const dataStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(path, dataStr, 'utf8');
}

function encodePrice(ratio: string): string {
    return new FixedMathBN(ratio)
        .sqrt()
        .multipliedBy(new FixedMathBN(2).pow(96))
        .integerValue(3)
        .toString()
}

import readline from 'readline';

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

async function main() {
    const config = loadJsonFile('deployment_config.json');

    const remainingPools = config.swapPools.filter(pool => !pool.address);

    if (remainingPools.length > 0) {
        const remainingPool = remainingPools[0];
        console.log('Deploying pool:', remainingPool.tokenA, remainingPool.tokenB);

        const microTokenA = FixedMathBN(1).dividedBy(FixedMathBN(10).pow(
            config.tokens[remainingPool.tokenA].decimals
        ));
        const microTokenB = FixedMathBN(1).dividedBy(FixedMathBN(10).pow(
            config.tokens[remainingPool.tokenB].decimals
        ));
        console.log('Token A decimals:', config.tokens[remainingPool.tokenA].decimals);
        console.log('Token B decimals:', config.tokens[remainingPool.tokenB].decimals);

        const prices = await queryPrices(config.tokens);

        console.log('Token A price:', prices[remainingPool.tokenA]);
        console.log('Token B price:', prices[remainingPool.tokenB]);

        const weiTokenAUsd = microTokenA.multipliedBy(prices[remainingPool.tokenA]);
        const weiTokenBUsd = microTokenB.multipliedBy(prices[remainingPool.tokenB]);

        // The ratio is equivalent to the ratio between the price of tokenA divided by the price of tokenB
        // Equivalently, it tells you how many wei of tokenB you get for 1 wei of tokenA
        // If 1 wei of tokenA is worth 5 USD and 1 wei of tokenB is worth 2 USD, then the ratio is 5/2 = 2.5
        // In fact, you can insert 1 USD's worth of tokenA (0.2 weiA) and get 0.5 weiB, which is worth 1 USD
        const ratio = weiTokenAUsd.dividedBy(weiTokenBUsd);

        console.log('Price-adjusted ratio:', ratio.toString());


        const oneUsdWorthOfTokenA = FixedMathBN(1).dividedBy(prices[remainingPool.tokenA]);
        const oneUsdWorthOfTokenAInWei = oneUsdWorthOfTokenA.multipliedBy(FixedMathBN(10).pow(config.tokens[remainingPool.tokenA].decimals));
        const equivalentTokenBInWei = oneUsdWorthOfTokenAInWei.multipliedBy(ratio);
        const equivalentTokenB = equivalentTokenBInWei.dividedBy(FixedMathBN(10).pow(config.tokens[remainingPool.tokenB].decimals));
        const priceOfEquivalentTokenB = equivalentTokenB.multipliedBy(prices[remainingPool.tokenB]);

        console.log('If I send 1 USD worth of token A, I will get', equivalentTokenB.toString(), 'of token B worth', priceOfEquivalentTokenB.toString());

        //await askQuestion('Press enter to deploy the pool.');

        const tickSpacing = TICK_SPACINGS[remainingPool.volatility];
        
        const poolContract = await deployPool(
            config.commonContracts.controller,
            config.commonContracts.factory,
            config.tokens[remainingPool.tokenA].address,
            config.tokens[remainingPool.tokenB].address,
            config.fee * 1_000_000,
            config.protocolFeeFraction,
            tickSpacing,
            config.commonContracts.tieredDiscount,
            weiTokenAUsd,
            weiTokenBUsd
        );

        remainingPool.address = poolContract.address;
        saveJsonFile('deployment_config.json', config);
    }

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).then(() => process.exit());