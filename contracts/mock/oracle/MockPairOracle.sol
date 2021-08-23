// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../Interfaces/IPairOracle.sol";
import "../../Operator.sol";

contract MockPairOracle is IPairOracle, Operator {
    using SafeMath for uint256;

    uint256 public mockPrice;
    uint256 constant PRICE_PRECISION = 1e18;
    uint256 public PERIOD = 600; // in seconds

    constructor(uint256 _mockPrice) public {
        mockPrice = _mockPrice;
    }

    function consult(
        address, /*token*/
        uint256 amountIn
    ) external view override returns (uint256 amountOut) {
        return mockPrice.mul(amountIn).div(PRICE_PRECISION);
    }

    function update() external override {}

    function setPeriod(uint256 _period) external onlyOperator {
        PERIOD = _period;
    }

    function mock(uint256 _mockPrice) external onlyOperator {
        mockPrice = _mockPrice;
    }
}
