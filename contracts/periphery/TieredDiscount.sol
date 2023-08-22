// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../core/interfaces/IFeeManager.sol';

// TODO: Add docs

contract TieredDiscount is IFeeManager {
    uint256 public constant DENOMINATOR = 10000;

    address public token;
    uint256[] public thresholds;
    uint16[] public discounts;

    constructor (address _token, uint256[] memory _thresholds, uint16[] memory _discounts) {
        require(_thresholds.length > 0, "Thresholds must not be empty");
        require(_thresholds.length == _discounts.length, "Thresholds and discounts must have the same length");

        for (uint256 i = 0; i < _thresholds.length; i++) {
            require(_thresholds[i] > 0, "Thresholds must be positive");
            require(_discounts[i] <= DENOMINATOR, "Discounts must not be higher than 100%");

            if (i > 0) {
                require(_thresholds[i] > _thresholds[i - 1], "Thresholds must be strictly increasing");
                require(_discounts[i] > _discounts[i - 1], "Discounts must be strictly increasing");
            }
        }

        token = _token;
        thresholds = _thresholds;
        discounts = _discounts;
    }

    function computeFee(uint24 fee) external view override returns (uint24) {
        // Note the usage of tx.origin instead of msg.sender
        return computeFeeFor(fee, tx.origin);
    }

    function computeFeeFor(
        uint24 fee,
        address recipient
    ) public view returns (uint24) {
        uint256 balance = IERC20(token).balanceOf(recipient);

        uint16 bestDiscount = 0;

        for (uint256 i = 0; i < thresholds.length; i++) {
            if (balance >= thresholds[i]) {
                bestDiscount = discounts[i];
            } else {
                break;
            }
        }

        // Never underflows, since bestDiscount <= DENOMINATOR
        uint256 coefficient = DENOMINATOR - bestDiscount;

        // Never overflows, since coefficient is in [0, 10000] and DENOMINATOR = 10000
        return uint24(uint256(fee) * coefficient / DENOMINATOR);
    }
}