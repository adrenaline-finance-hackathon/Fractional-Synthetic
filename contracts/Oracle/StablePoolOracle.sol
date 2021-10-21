// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Interfaces/ISwap.sol";

import "hardhat/console.sol";

contract StablePoolOracle is Ownable {
    using SafeMath for uint256;

    ISwap public swap;

    uint256 public constant PERIOD = 600; // 10 mins TWAP (time-weighted average price)
    uint256 public constant FEE_DENOMINATOR = 1e10;
    uint256 public constant DENOMINATOR = 1e18;
    uint256 public TWAP;
    uint256 public priceCumulativeLast;
    uint32 public blockTimestampLast;
    uint8 public immutable fromTokenIndex;
    uint8 public immutable toTokenIndex;
    bool public enableTwap;
    uint256 public quoteAmount = 1e18;

    constructor(
        address _swapContract,
        address _fromToken,
        address _toToken
    ) public {
        swap = ISwap(_swapContract);
        fromTokenIndex = swap.getTokenIndex(_fromToken);
        toTokenIndex = swap.getTokenIndex(_toToken);
        blockTimestampLast = uint32(block.timestamp);
    }

    function consult(
        address, /*_token*/
        uint256 /*_amount*/
    ) external view returns (uint256) {
        if (enableTwap) {
            return TWAP;
        }
        // price that is deducted fee already
        uint256 priceWithDeductedFee = swap.calculateSwap(
            fromTokenIndex,
            toTokenIndex,
            quoteAmount
        );

        priceWithDeductedFee.mul(DENOMINATOR).div(quoteAmount);

        uint256 _swapFee = fee(); // fee in 1e18 base

        // priceWithoutFee = priceWithDeductedFee / (1-_swapFee)
        uint256 _priceWithoutFee = priceWithDeductedFee.mul(DENOMINATOR).div(
            DENOMINATOR - _swapFee
        );
        return _priceWithoutFee;
    }

    function fee() public view returns (uint256 _fee) {
        (, , , , _fee, , ) = swap.swapStorage(); // return swap fee with 1e10 base
        // convert from 1e8 to 1e18 base
        _fee = _fee.mul(DENOMINATOR / FEE_DENOMINATOR);
    }

    function setQuoteAmount(uint256 _newAmount) external onlyOwner {
        require(_newAmount.mod(10e18) == 0, "Invalid amount");
        quoteAmount = _newAmount;
    }

    function update() external {
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast; // overflow is desired
        require(timeElapsed >= PERIOD, "StablePoolOracle: PERIOD_NOT_ELAPSED");
        uint256 _swapFee = fee(); // fee in 1e18 base

        // price that is deducted fee already
        uint256 priceWithDeductedFee = swap.calculateSwap(
            fromTokenIndex,
            toTokenIndex,
            quoteAmount
        );

        priceWithDeductedFee.mul(DENOMINATOR).div(quoteAmount);

        // priceWithoutFee = priceWithDeductedFee / (1-_swapFee)
        uint256 _priceWithoutFee = priceWithDeductedFee.mul(DENOMINATOR).div(
            DENOMINATOR - _swapFee
        );

        uint256 _priceCumulative = priceCumulativeLast +
            (_priceWithoutFee * timeElapsed);

        // Ref: https://uniswap.org/docs/v2/core-concepts/oracles/
        TWAP = (_priceCumulative - priceCumulativeLast) / timeElapsed;

        console.log("#######", block.number, timeElapsed, "#######");
        console.log("_priceWithoutFee", _priceWithoutFee, TWAP, "TWAP");
        blockTimestampLast = uint32(block.timestamp);
        priceCumulativeLast = _priceCumulative;
    }

    function toggleMode() external onlyOwner {
        enableTwap = !enableTwap;
    }
}
