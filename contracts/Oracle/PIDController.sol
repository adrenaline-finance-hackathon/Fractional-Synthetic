// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ReserveTracker.sol";
import "../Interfaces/ITWAP.sol";
import "../Interfaces/ICollateralReserve.sol";

import "hardhat/console.sol";

contract PIDController is AccessControlUpgradeable {
    using SafeMath for uint256;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    // Instances
    ICollateralReserve public collateralReserve;
    // Twin private share;
    ReserveTracker public reserveTracker;

    // Synthetic and Share addresses
    address public collateralReserveAddress;
    address public shareContractAddress;

    // Misc addresses
    address public reserveTrackerAddress;
    address public priceFeedAddress;

    // 6 decimals of precision
    uint256 public growthRatio;
    uint256 public GR_TOP_BAND;
    uint256 public GR_BOTTOM_BAND;

    // Time-related
    uint256 public internalCooldown;
    uint256 public lastUpdate;

    // Booleans
    bool public isActive;

    function initialize(
        address _collateralReserveAddress,
        address _shareContractAddress,
        address _reserveTrackerAddress,
        address _priceFeedAddress
    ) public initializer {
        collateralReserveAddress = _collateralReserveAddress;
        shareContractAddress = _shareContractAddress;
        reserveTrackerAddress = _reserveTrackerAddress;
        priceFeedAddress = _priceFeedAddress;

        reserveTracker = ReserveTracker(reserveTrackerAddress);
        collateralReserve = ICollateralReserve(_collateralReserveAddress);

        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MAINTAINER, msg.sender);

        // Upon genesis, if GR changes by more than 1% percent, enable change of collateral ratio
        GR_TOP_BAND = 1e15; // 1%
        GR_BOTTOM_BAND = 1e15; // 1%
        isActive = false;
    }

    /* ========== PUBLIC MUTATIVE FUNCTIONS ========== */

    function refreshCollateralRatio() public {
        uint256 timeElapsed = (block.timestamp).sub(lastUpdate);
        require(
            timeElapsed >= internalCooldown,
            "internal cooldown not passed"
        );
        require(isActive == true, "unactive");

        uint256 shareReserves = reserveTracker.getShareReserves();

        // ! TODO: share price
        uint256 sharePrice = ITWAP(priceFeedAddress).consult(
            address(shareContractAddress),
            1e18
        );

        uint256 shareLiquidity = (shareReserves.mul(sharePrice));

        uint256 synthTotalSupply = collateralReserve.totalGlobalSynthValue();

        uint256 newGrowthRatio = shareLiquidity.div(synthTotalSupply); // (E18 + E6) / E18

        // First, check if the price is out of the band
        if (newGrowthRatio > growthRatio.mul(1e18 + GR_TOP_BAND).div(1e18)) {
            collateralReserve.stepDownTCR();
        } else if (
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

    function setReserveTracker(address _reserveTrackerAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        reserveTrackerAddress = _reserveTrackerAddress;
        reserveTracker = ReserveTracker(_reserveTrackerAddress);
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

    function setInternalCooldown(uint256 _internalCooldown) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        internalCooldown = _internalCooldown;
    }

    uint256[49] private __gap;
}
