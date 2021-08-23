// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./StableReserveTracker.sol";
import "../Interfaces/ITWAP.sol";
import "../Interfaces/ICollateralReserve.sol";

import "hardhat/console.sol";

contract StablePIDController is AccessControlUpgradeable {
    using SafeMath for uint256;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    // Instances
    ICollateralReserve public collateralReserve;
    // Twin private share;
    StableReserveTracker public stableReserveTracker;

    // Synthetic and Share addresses
    address public collateralReserveAddress;
    address public shareContractAddress;

    // Misc addresses
    address public stableReserveTrackerAddress;
    address public priceFeedAddress;

    // oracles
    address public synthAddress;
    address public synthOracleAddress;

    // 6 decimals of precision
    uint256 public growthRatio;
    uint256 public GR_TOP_BAND;
    uint256 public GR_BOTTOM_BAND;

    uint256 public SYNTH_TOP_BAND;
    uint256 public SYNTH_BOTTOM_BAND;

    // Time-related
    uint256 public internalCooldown;
    uint256 public lastUpdate;

    // Booleans
    bool public isActive;
    bool public useGrowthRatio;

    function initialize(
        address _collateralReserveAddress,
        address _shareContractAddress,
        address _stableReserveTrackerAddress,
        address _priceFeedAddress,
        address _synthAddress,
        address _synthOracleAddress
    ) public initializer {
        collateralReserveAddress = _collateralReserveAddress;
        shareContractAddress = _shareContractAddress;
        stableReserveTrackerAddress = _stableReserveTrackerAddress;
        priceFeedAddress = _priceFeedAddress;
        synthAddress = _synthAddress;
        synthOracleAddress = _synthOracleAddress;

        stableReserveTracker = StableReserveTracker(
            stableReserveTrackerAddress
        );
        collateralReserve = ICollateralReserve(_collateralReserveAddress);

        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MAINTAINER, msg.sender);

        // Upon genesis, if GR changes by more than 1% percent, enable change of collateral ratio
        GR_TOP_BAND = 1e16; // 1%
        GR_BOTTOM_BAND = 1e16; // 1%
        SYNTH_TOP_BAND = 1010e15; // 1.01 (1+1%)
        SYNTH_BOTTOM_BAND = 990e15; // 0.99 (1-1%)
        isActive = true;
        useGrowthRatio = true;
    }

    /* ========== PUBLIC MUTATIVE FUNCTIONS ========== */

    function refreshCollateralRatio() public {
        uint256 timeElapsed = (block.timestamp).sub(lastUpdate);
        require(
            timeElapsed >= internalCooldown,
            "internal cooldown not passed"
        );
        require(isActive == true, "unactive");

        uint256 shareReserves = stableReserveTracker.getShareReserves();

        // ! TODO: share price
        uint256 sharePrice = ITWAP(priceFeedAddress).consult(
            address(shareContractAddress),
            1e18
        );

        uint256 synthPrice = ITWAP(synthOracleAddress).consult(
            address(synthAddress),
            1e18
        );

        uint256 shareLiquidity = (shareReserves.mul(sharePrice));

        uint256 synthTotalSupply = collateralReserve.totalGlobalSynthValue();

        uint256 newGrowthRatio = shareLiquidity.div(synthTotalSupply); // (E18 + E18) / E18

        // First, check if the price is out of the band
        if (synthPrice > SYNTH_TOP_BAND) {
            collateralReserve.stepDownTCR();
        } else if (synthPrice < SYNTH_BOTTOM_BAND) {
            collateralReserve.stepUpTCR();
        } else if (
            useGrowthRatio &&
            newGrowthRatio > growthRatio.mul(1e18 + GR_TOP_BAND).div(1e18)
        ) {
            collateralReserve.stepDownTCR();
        } else if (
            useGrowthRatio &&
            newGrowthRatio < growthRatio.mul(1e18 - GR_BOTTOM_BAND).div(1e18)
        ) {
            collateralReserve.stepUpTCR();
        }

        growthRatio = newGrowthRatio;
        lastUpdate = block.timestamp;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function activate(bool _state) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        isActive = _state;
    }

    function setCollateralReserve(address _collateralReserveAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        collateralReserveAddress = _collateralReserveAddress;
        collateralReserve = ICollateralReserve(_collateralReserveAddress);
    }

    function setShareContractAddress(address _shareContractAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        shareContractAddress = _shareContractAddress;
    }

    function setReserveTracker(address _stableReserveTrackerAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        stableReserveTrackerAddress = _stableReserveTrackerAddress;
        stableReserveTracker = StableReserveTracker(
            _stableReserveTrackerAddress
        );
    }

    function setPriceFeedAddress(address _priceFeedAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        priceFeedAddress = _priceFeedAddress;
    }

    // As a percentage added/subtracted from the previous; e.g. top_band = 4000 = 0.4% -> will decollat if GR increases by 0.4% or more
    function setGrowthRatioBands(uint256 _GR_top_band, uint256 _GR_bottom_band)
        external
    {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        GR_TOP_BAND = _GR_top_band;
        GR_BOTTOM_BAND = _GR_bottom_band;
    }

    function setPriceBands(uint256 _topBand, uint256 _bottomBand) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        SYNTH_TOP_BAND = _topBand;
        SYNTH_BOTTOM_BAND = _bottomBand;
    }

    function setUseGrowthRatio(bool _useGrowthRatio) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        useGrowthRatio = _useGrowthRatio;
    }

    function setInternalCooldown(uint256 _internalCooldown) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        internalCooldown = _internalCooldown;
    }

    function setSynthOracle(address _synthOracleAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(
            _synthOracleAddress != address(0),
            "Zero address given for new oracle address"
        );
        synthOracleAddress = _synthOracleAddress;
    }

    uint256[49] private __gap;
}
