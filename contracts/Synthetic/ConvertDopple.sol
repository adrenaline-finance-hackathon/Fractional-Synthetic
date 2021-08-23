// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ConvertDopple is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public dopple;
    address public doppleX;
    address public burnTo;

    event Convert(address, uint256);

    constructor(
        address _dopple,
        address _doppleX,
        address _burnTo
    ) public {
        dopple = _dopple;
        doppleX = _doppleX;
        burnTo = _burnTo;
    }

    function adminEmergencyWithdraw(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Should not be zero");

        IERC20 _doppleX = IERC20(doppleX);
        uint256 _balance = _doppleX.balanceOf(address(this));

        require(_balance > 0, "Nothing to withdraw");
        require(_amount <= _balance, "Exceed balance");

        _doppleX.transfer(msg.sender, _amount);
    }

    function convert(uint256 _amount) external {
        require(_amount > 0, "Should not be zero");

        IERC20 _dopple = IERC20(dopple);
        IERC20 _doppleX = IERC20(doppleX);

        require(
            _dopple.balanceOf(msg.sender) >= _amount,
            "convert: User has insufficient Dop Balance"
        );

        require(
            _doppleX.balanceOf(address(this)) >= _amount,
            "convert: Contract has insufficient DoppleX amount"
        );

        _dopple.safeTransferFrom(msg.sender, burnTo, _amount);
        _doppleX.transfer(msg.sender, _amount);

        emit Convert(msg.sender, _amount);
    }
}
