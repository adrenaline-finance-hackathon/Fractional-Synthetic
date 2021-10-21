// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ISynthPool {
    function synth() external returns (address);

    function mintingFee() external returns (uint256);

    function mintFractionalSynth(
        uint256 _collateralAmount,
        uint256 _shareAmount,
        uint256 _synthOutMin
    ) external;
}
