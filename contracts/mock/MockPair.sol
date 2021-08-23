// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

contract MockPair {
    address public token0;
    address public token1;
    uint112 public reserve0;
    uint112 public reserve1;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    constructor(
        address t0,
        address t1,
        uint112 r0,
        uint112 r1
    ) public {
        token0 = t0;
        token1 = t1;
        reserve0 = r0;
        reserve1 = r1;
    }

    function getReserves()
        external
        view
        returns (
            uint112,
            uint112,
            uint32
        )
    {
        return (reserve0, reserve1, 0);
    }

    function setReserves(uint112 _reserve0, uint112 _reserve1) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
    }

    function setPriceCumulativeLast(
        uint256 _price0CumulativeLast,
        uint256 _price1CumulativeLast
    ) external {
        price0CumulativeLast = _price0CumulativeLast;
        price1CumulativeLast = _price1CumulativeLast;
    }
}
