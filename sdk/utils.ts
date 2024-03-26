import { BigNumber } from "@ethersproject/bignumber"
import { BigintIsh, Token } from "@uniswap/sdk-core"
import { FeeAmount, Pool, Position, TICK_SPACINGS, Tick, TickConstructorArgs, TickDataProvider } from "@uniswap/v3-sdk"
import bn from 'bignumber.js'
import JSBI from "jsbi"



const FixedMathBN = bn.clone({ DECIMAL_PLACES: 40, EXPONENTIAL_AT: 999999 })

function encodePrice(ratio : string) : BigNumber {
  return BigNumber.from(
    new FixedMathBN(ratio).sqrt()
      .multipliedBy(new FixedMathBN(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

function decodePrice(price : BigNumber) : string {
    return new FixedMathBN(price.toString())
    .dividedBy(new FixedMathBN(2).pow(96))
    .pow(2)
    .toString()
}

async function withCustomTickSpacing(fee, tickSpacing, f) {
  const old_value = TICK_SPACINGS[fee]
  TICK_SPACINGS[fee] = tickSpacing

  const result = await f()

  TICK_SPACINGS[fee] = old_value

  return result
}

export { encodePrice, decodePrice, withCustomTickSpacing, FixedMathBN }