// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface ITreasuryVault {
    function asset() external view returns (address);

    function vaultBalance() external view returns (uint256);

    function deposit(uint256 _amount) external;

    function withdraw() external;
}
