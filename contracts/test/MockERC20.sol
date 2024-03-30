// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("MockERC20", "MERC") {
    }

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}