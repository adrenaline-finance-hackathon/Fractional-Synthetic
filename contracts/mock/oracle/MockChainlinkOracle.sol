// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../../Operator.sol";

contract MockChainlinkOracle is Operator {
    string public pairName;

    uint256 public latestPrice;
    uint256 public decimals;
    uint256 public timestamp;

    constructor(
        string memory _pairName,
        uint256 _decimals,
        uint256 _initialPrice
    ) public {
        pairName = _pairName;
        decimals = _decimals;
        latestPrice = _initialPrice;
        timestamp = block.timestamp;
    }

    function consult(
        address, /*_token*/
        uint256 /*_amountIn*/
    ) external view returns (uint256 amountOut) {
        return latestPrice;
    }

    function latestAnswer() internal view returns (uint256) {
        return latestPrice;
    }

    function latestTimestamp() internal view returns (uint256) {
        return timestamp;
    }

    function update(uint256 _price) public onlyOperator {
        latestPrice = _price;
        timestamp = block.timestamp;
    }
}
