import { ethers } from 'hardhat'

import WETH9 from '../contracts/WETH9.json'
import { Contract } from '@ethersproject/contracts'
import { constants } from 'ethers'

const wethFixture = async ([wallet]) => {
  const weth9Factory = await ethers.getContractFactory('WETH9')
  const weth9 = (await weth9Factory.deploy())

  return { weth9 }
}

const v3CoreFactoryFixture = async ([wallet]) => {
  const v3CoreFactoryFactory = await ethers.getContractFactory('VinuSwapFactory')
  return await v3CoreFactoryFactory.deploy()
}

export const v3RouterFixture = async ([wallet]) => {
  const { weth9 } = await wethFixture([wallet])
  const factory = await v3CoreFactoryFixture([wallet])

  const router = (await (await ethers.getContractFactory('MockTimeSwapRouter')).deploy(
    factory.address,
    weth9.address
  )) as any

  return { factory, weth9, router }
}
