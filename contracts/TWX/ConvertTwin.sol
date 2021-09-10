// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ConvertTwin is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public twin;
    IERC20 public twx;
    address public burnTo;

    event Convert(address sender, uint256 amount);

    constructor(
        IERC20 _twin,
        IERC20 _twx,
        address _burnTo
    ) public {
        twin = _twin;
        twx = _twx;
        burnTo = _burnTo;
    }

    function adminEmergencyWithdraw(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Should not be zero");

        uint256 _balance = twx.balanceOf(address(this));

        require(_balance > 0, "Nothing to withdraw");
        require(_amount <= _balance, "Exceed balance");

        twx.transfer(msg.sender, _amount);
    }

    function convert(uint256 _amount) external {
        require(_amount > 0, "Should not be zero");

        require(
            twin.balanceOf(msg.sender) >= _amount,
            "convert: User has insufficient TWIN Balance"
        );

        require(
            twx.balanceOf(address(this)) >= _amount,
            "convert: Contract has insufficient TWX amount"
        );

        twin.safeTransferFrom(msg.sender, burnTo, _amount);
        twx.transfer(msg.sender, _amount);

        emit Convert(msg.sender, _amount);
    }
}
