// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface ITWAP {
    function consult(address _token, uint256 _amountIn)
        external
        view
        returns (uint256 _amountOut);
}
