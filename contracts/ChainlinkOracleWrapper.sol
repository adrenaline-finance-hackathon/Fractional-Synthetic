// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./Operator.sol";

interface AggregatorV3Interface {
    function latestAnswer() external view returns (int256);

    function latestTimestamp() external view returns (uint256);

    function decimals() external view returns (uint8);
}

contract ChainlinkOracleWrapper is Operator {
    using SafeMath for uint256;
    using SafeMath for uint8;

    AggregatorV3Interface public priceFeed;
    string public pairName;

    constructor(AggregatorV3Interface _priceFeed, string memory _pairName)
        public
    {
        priceFeed = _priceFeed;
        pairName = _pairName;
    }

    function consult(
        address, /*_token*/
        uint256 /*_amountIn*/
    ) external view returns (uint256 amountOut) {
        return latestAnswer();
    }

    function latestAnswer() internal view returns (uint256 _price) {
        int256 price = priceFeed.latestAnswer();
        require(price >= 0, "price is signed integer.");

        _price = uint256(price);

        // convert decimals 8 to 18
        if (priceFeed.decimals() == 8) {
            _price = _price.mul(10000000000);
        }
    }

    function latestTimestamp() internal view returns (uint256 _timestamp) {
        _timestamp = priceFeed.latestTimestamp();
    }

    function setRefOracleAddress(AggregatorV3Interface _priceFeed)
        public
        onlyOperator
    {
        priceFeed = _priceFeed;
    }
}
