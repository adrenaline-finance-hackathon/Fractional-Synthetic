// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IComptroller {
    function claimVenus(address holder, address[] memory vTokens) external;

    function venusAccrued(address account) external view returns (uint256);
}
