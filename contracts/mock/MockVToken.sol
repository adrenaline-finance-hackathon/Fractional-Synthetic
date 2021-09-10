// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

import "hardhat/console.sol";

contract MockVToken is ERC20Burnable {
    address public underlying;
    address public comptroller;

    constructor(address _underlying, address _comptroller)
        public
        ERC20("Mock", "Mock")
    {
        underlying = _underlying;
        comptroller = _comptroller;
    }

    function mint(uint256 _amount) external returns (uint256) {
        IERC20(underlying).transferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
        return _amount;
    }

    function redeem(uint256 _amount) external returns (uint256) {
        // redeem
        _approve(msg.sender, msg.sender, _amount);
        burnFrom(msg.sender, _amount);
        IERC20(underlying).transfer(msg.sender, _amount);
        return _amount;
    }
}
