// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Interfaces/ISwap.sol";

import "hardhat/console.sol";

contract TempStablePoolOracle is Ownable {
    using SafeMath for uint256;

    constructor() public {}

    function consult(
        address, /*_token*/
        uint256 /*_amount*/
    ) external pure returns (uint256) {
        return 1e18;
    }
}
