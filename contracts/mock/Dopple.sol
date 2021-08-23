// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Dopple is ERC20 {
    constructor(uint256 initialSupply) public ERC20("Dopple", "Dopple") {
        _mint(msg.sender, initialSupply);
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
