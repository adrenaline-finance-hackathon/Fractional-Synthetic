// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWithName is ERC20 {
    constructor(
        uint256 initialSupply,
        string memory _name,
        string memory _symbol
    ) public ERC20(_name, _symbol) {
        _mint(msg.sender, initialSupply);
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
