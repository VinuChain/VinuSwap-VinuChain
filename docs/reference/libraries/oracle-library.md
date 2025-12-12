# OracleLibrary

Helper functions for interacting with the pool's TWAP oracle.

**Source:** `contracts/periphery/libraries/OracleLibrary.sol`

## Functions

### consult

```solidity
function consult(
    address pool,
    uint32 secondsAgo
) internal view returns (int24 arithmeticMeanTick, uint128 harmonicMeanLiquidity)
```

Returns the time-weighted average tick and liquidity for a period.

### getQuoteAtTick

```solidity
function getQuoteAtTick(
    int24 tick,
    uint128 baseAmount,
    address baseToken,
    address quoteToken
) internal pure returns (uint256 quoteAmount)
```

Returns a quote amount given a tick and base amount.

### getOldestObservationSecondsAgo

```solidity
function getOldestObservationSecondsAgo(
    address pool
) internal view returns (uint32 secondsAgo)
```

Returns the age of the oldest available observation.

## Usage Examples

### Get TWAP Price

```javascript
async function getTWAP(poolAddress, secondsAgo) {
    const pool = new ethers.Contract(poolAddress, poolABI, provider);

    // Get tick cumulatives
    const [tickCumulatives] = await pool.observe([secondsAgo, 0]);

    // Calculate average tick
    const tickCumulativesDelta = tickCumulatives[1].sub(tickCumulatives[0]);
    const arithmeticMeanTick = tickCumulativesDelta.div(secondsAgo);

    // Convert tick to price
    const price = Math.pow(1.0001, arithmeticMeanTick.toNumber());

    return price;
}

// Get 30-minute TWAP
const twapPrice = await getTWAP(poolAddress, 1800);
console.log('30-min TWAP:', twapPrice);
```

### Solidity TWAP Integration

```solidity
import './libraries/OracleLibrary.sol';

contract TWAPOracle {
    function getTWAPPrice(
        address pool,
        uint32 secondsAgo
    ) external view returns (uint256 price) {
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, secondsAgo);
        return OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            1e18,      // Base amount
            token0,    // Base token
            token1     // Quote token
        );
    }
}
```

### Check Oracle Availability

```javascript
async function checkOracleCapacity(poolAddress) {
    const pool = new ethers.Contract(poolAddress, poolABI, provider);

    const slot0 = await pool.slot0();
    const cardinality = slot0.observationCardinality;

    // Estimate maximum TWAP period (assuming 12s blocks)
    const maxSeconds = cardinality * 12;
    const maxHours = maxSeconds / 3600;

    console.log('Oracle capacity:', cardinality, 'observations');
    console.log('Max TWAP period:', maxHours.toFixed(1), 'hours');

    return { cardinality, maxSeconds };
}
```

### Increase Oracle Capacity

```javascript
async function increaseOracleCapacity(poolAddress, desiredHours) {
    const pool = new ethers.Contract(poolAddress, poolABI, signer);

    // Calculate needed cardinality (12s blocks)
    const neededCardinality = Math.ceil((desiredHours * 3600) / 12);

    const slot0 = await pool.slot0();
    if (slot0.observationCardinality < neededCardinality) {
        await pool.increaseObservationCardinalityNext(neededCardinality);
        console.log(`Increased oracle capacity to ${neededCardinality}`);
    }
}

// Support 24-hour TWAP
await increaseOracleCapacity(poolAddress, 24);
```

## TWAP Considerations

### Observation Cardinality

- Default cardinality is 1 (current observation only)
- Must increase for TWAP calculations
- Increasing cardinality costs gas once

### TWAP vs Spot Price

| Aspect | Spot Price | TWAP |
|--------|------------|------|
| Source | `slot0.sqrtPriceX96` | `observe()` |
| Manipulation | Easy (single block) | Difficult (many blocks) |
| Use Case | UI display | Oracles, liquidations |
| Gas | Very low | Low |

### Security

- TWAP is manipulation-resistant but not manipulation-proof
- Longer periods are more secure but less responsive
- Consider multiple pool TWAP for critical applications

## Related

- [VinuSwapPool](../core/pool.md)
- [Core Concepts](../../overview/concepts.md)
