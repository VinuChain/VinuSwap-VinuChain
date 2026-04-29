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

// Serializes overrides on the shared @uniswap/v3-sdk TICK_SPACINGS map. Without
// this, two concurrent SDK calls would race to write/restore the same global
// entry — the second would observe the first's override and the first would
// "restore" the wrong baseline.
let tickSpacingChain: Promise<unknown> = Promise.resolve();

async function withCustomTickSpacing<T>(
  fee: number,
  tickSpacing: number,
  f: (() => Promise<T>) | (() => T)
): Promise<T> {
  const run = tickSpacingChain.then(async () => {
    // @ts-ignore
    const old_value = TICK_SPACINGS[fee];

    // @ts-ignore
    TICK_SPACINGS[fee] = tickSpacing;

    try {
      return await f();
    } finally {
      // @ts-ignore
      TICK_SPACINGS[fee] = old_value;
    }
  });

  // Keep the chain alive even if this call rejects, so subsequent callers
  // still get serialized against a settled promise instead of a pending one.
  tickSpacingChain = run.catch(() => undefined);

  return run as Promise<T>;
}

export { encodePrice, decodePrice, withCustomTickSpacing, FixedMathBN };
