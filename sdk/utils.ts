import { BigNumber } from "@ethersproject/bignumber";
// @ts-ignore
import { TICK_SPACINGS } from "@uniswap/v3-sdk";
import bn from "bignumber.js";

const FixedMathBN = bn.clone({ DECIMAL_PLACES: 40, EXPONENTIAL_AT: 999999 });

function encodePrice(ratio: string): BigNumber {
  return BigNumber.from(
    new FixedMathBN(ratio)
      .sqrt()
      .multipliedBy(new FixedMathBN(2).pow(96))
      .integerValue(3)
      .toString()
  );
}

function decodePrice(price: BigNumber): string {
  return new FixedMathBN(price.toString())
    .dividedBy(new FixedMathBN(2).pow(96))
    .pow(2)
    .toString();
}

async function withCustomTickSpacing<T>(
  fee: number,
  tickSpacing: number,
  f: (() => Promise<T>) | (() => T)
): Promise<T> {
  // @ts-ignore
  const old_value = TICK_SPACINGS[fee];

  // @ts-ignore
  TICK_SPACINGS[fee] = tickSpacing;

  const result = await f();

  // @ts-ignore
  TICK_SPACINGS[fee] = old_value;

  return result;
}

export { encodePrice, decodePrice, withCustomTickSpacing, FixedMathBN };
