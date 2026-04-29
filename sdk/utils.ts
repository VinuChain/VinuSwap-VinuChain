import { BigNumber } from "@ethersproject/bignumber";
import { TICK_SPACINGS as _TICK_SPACINGS } from "@uniswap/v3-sdk";
import bn from "bignumber.js";

const TICK_SPACINGS = _TICK_SPACINGS as Record<number, number>;

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

// Serializes overrides on the shared @uniswap/v3-sdk TICK_SPACINGS map per fee.
// Without this, two concurrent SDK calls targeting the same fee tier would race
// to write/restore the same entry. Different fees never collide so each gets
// its own chain — UI flows that fan out across pools still run in parallel.
const tickSpacingChains = new Map<number, Promise<unknown>>();

async function withCustomTickSpacing<T>(
  fee: number,
  tickSpacing: number,
  f: (() => Promise<T>) | (() => T)
): Promise<T> {
  const previous = tickSpacingChains.get(fee) ?? Promise.resolve();
  const run = previous.then(async () => {
    const old_value = TICK_SPACINGS[fee];
    TICK_SPACINGS[fee] = tickSpacing;
    try {
      return await f();
    } finally {
      TICK_SPACINGS[fee] = old_value;
    }
  });

  tickSpacingChains.set(
    fee,
    run.catch(() => undefined)
  );

  return run;
}

export { encodePrice, decodePrice, withCustomTickSpacing, FixedMathBN };
