// SPDX-License-Identifier: MIT

pragma solidity >=0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../Interfaces/ITWAP.sol";
import "../Interfaces/ICustomToken.sol";
import "./StableCollateralReserve.sol";

contract KUSDPool is AccessControlUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");
    bytes32 private constant PAUSER = keccak256("PAUSER");

    // Core
    StableCollateralReserve public collateralReserve;

    // Token
    ICustomToken public share; // Super Dop
    ICustomToken public synth; // Synthetic
    IERC20 public collateralToken; // Stablecoin

    mapping(address => uint256) public lastAction;

    // Fee
    uint256 public mintingFee;
    uint256 public redemptionFee;
    uint256 public constant MAX_FEE = 5e16; // 5%

    // Constants for various precisions
    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant COLLATERAL_RATIO_PRECISION = 1e18;
    uint256 public constant COLLATERAL_RATIO_MAX = 1e18;
    uint256 public constant FEE_PRECISION = 1e18;

    // Flash loan & Reentrancy prevention
    uint256 public actionDelay;

    // AccessControl state variables
    bool public mintPaused;
    bool public redeemPaused;

    modifier notRedeemPaused() {
        require(redeemPaused == false, "Redeeming is paused");
        _;
    }

    modifier notMintPaused() {
        require(mintPaused == false, "Minting is paused");
        _;
    }

    function initialize(
        address _collateralReserve,
        address _collateralToken,
        address _synth,
        address _share,
        address _owner
    ) public initializer {
        collateralReserve = StableCollateralReserve(_collateralReserve);
        collateralToken = IERC20(_collateralToken);
        synth = ICustomToken(_synth);
        share = ICustomToken(_share);

        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        grantRole(MAINTAINER, _owner);

        actionDelay = 1; // Number of blocks to wait before being able to call mint or redeem
        mintPaused = true;
        redeemPaused = true;
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    // Returns the price of the pool collateral in USD
    function getCollateralPrice() public view returns (uint256) {
        return
            ITWAP(collateralReserve.oracleOf(address(collateralToken))).consult(
                address(collateralToken),
                1e18
            );
    }

    function getSynthPrice() public pure returns (uint256) {
        return 1e18;
    }

    // We separate out the 1t1, fractional and algorithmic minting functions for gas efficiency
    function mint1t1Synth(uint256 colAmount, uint256 synthOutMin)
        external
        notMintPaused
    {
        require(block.number >= lastAction[msg.sender].add(actionDelay));
        require(
            collateralReserve.globalCollateralRatio() >= COLLATERAL_RATIO_MAX,
            "Collateral ratio must be >= 1"
        );

        uint256 _synthAmount = colAmount.mul(getCollateralPrice()).div(
            getSynthPrice()
        );

        uint256 _synthAmountReceive = _synthAmount
            .mul(FEE_PRECISION.sub(mintingFee))
            .div(FEE_PRECISION);
        require(synthOutMin <= _synthAmountReceive, "Slippage limit reached");

        uint256 _fee = _synthAmount.sub(_synthAmountReceive);

        lastAction[msg.sender] = block.number;

        collateralToken.safeTransferFrom(
            msg.sender,
            address(collateralReserve),
            colAmount
        );

        synth.mint(msg.sender, _synthAmountReceive);
        synth.mint(address(this), _fee);
    }

    // 0% collateral-backed
    function mintAlgorithmicSynth(uint256 shareAmount, uint256 synthOutMin)
        external
        notMintPaused
    {
        require(block.number >= lastAction[msg.sender].add(actionDelay));
        require(share.balanceOf(msg.sender) >= shareAmount, "No enough Share");
        require(
            collateralReserve.globalCollateralRatio() == 0,
            "Collateral ratio must be 0"
        );

        uint256 _synthAmount = shareAmount
            .mul(collateralReserve.getSharePrice())
            .div(getSynthPrice());

        uint256 _synthAmountReceive = _synthAmount
            .mul(FEE_PRECISION.sub(mintingFee))
            .div(FEE_PRECISION);
        require(synthOutMin <= _synthAmountReceive, "Slippage limit reached");

        uint256 _fee = _synthAmount.sub(_synthAmountReceive);

        lastAction[msg.sender] = block.number;

        share.burnFrom(msg.sender, shareAmount);
        synth.mint(msg.sender, _synthAmountReceive);
        synth.mint(address(this), _fee);
    }

    // Will fail if fully collateralized or fully algorithmic
    // > 0% and < 100% collateral-backed
    function mintFractionalSynth(
        uint256 _collateralAmount,
        uint256 _shareAmount,
        uint256 _synthOutMin
    ) external notMintPaused {
        require(block.number >= lastAction[msg.sender].add(actionDelay));

        uint256 _sharePrice = collateralReserve.getSharePrice();
        uint256 _collateralPrice = getCollateralPrice();
        uint256 _synthPrice = getSynthPrice();
        uint256 _globalCollateralRatio = collateralReserve
            .globalCollateralRatio();

        require(
            _globalCollateralRatio < COLLATERAL_RATIO_MAX &&
                _globalCollateralRatio > 0,
            "Collateral ratio must not be 100% or 0%"
        );

        require(share.balanceOf(msg.sender) >= _shareAmount, "No enough Share");

        uint256 _collateralValue = _collateralAmount.mul(_collateralPrice);
        uint256 _shareNeeded = COLLATERAL_RATIO_MAX
            .sub(_globalCollateralRatio)
            .mul(_collateralValue)
            .div(_globalCollateralRatio.mul(_sharePrice));

        uint256 _totalDepositValue = _collateralValue.add(
            _shareNeeded.mul(_sharePrice)
        );

        uint256 _synthAmount = _totalDepositValue
            .mul(PRICE_PRECISION)
            .div(_synthPrice)
            .div(PRICE_PRECISION);

        uint256 _synthAmountReceive = _synthAmount
            .mul(FEE_PRECISION.sub(mintingFee))
            .div(FEE_PRECISION);
        require(_synthOutMin <= _synthAmountReceive, "Slippage limit reached");
        require(_shareNeeded <= _shareAmount, "Not enough Share inputted");

        uint256 _fee = _synthAmount.sub(_synthAmountReceive);

        lastAction[msg.sender] = block.number;

        share.burnFrom(msg.sender, _shareNeeded);
        collateralToken.safeTransferFrom(
            msg.sender,
            address(collateralReserve),
            _collateralAmount
        );
        synth.mint(msg.sender, _synthAmountReceive);
        synth.mint(address(this), _fee);
    }

    // Redeem collateral. 100% collateral-backed
    function redeem1t1Synth(
        uint256 _synthAmount,
        uint256 _minCollateralAmountOut
    ) external notRedeemPaused {
        require(block.number >= lastAction[msg.sender].add(actionDelay));
        require(
            collateralReserve.globalCollateralRatio() == COLLATERAL_RATIO_MAX,
            "Collateral ratio must be == 1"
        );
        require(synth.balanceOf(msg.sender) >= _synthAmount, "No enough synth");

        uint256 _collateralNeeded = _synthAmount.mul(getSynthPrice()).div(
            getCollateralPrice()
        );

        uint256 _collateralReceived = (
            _collateralNeeded.mul(PRICE_PRECISION.sub(redemptionFee))
        ).div(PRICE_PRECISION);

        require(
            _collateralReceived <=
                collateralToken.balanceOf(address(collateralReserve)),
            "Not enough collateral in pool"
        );
        require(
            _minCollateralAmountOut <= _collateralReceived,
            "Slippage limit reached"
        );

        uint256 _fee = _collateralNeeded.sub(_collateralReceived);

        lastAction[msg.sender] = block.number;

        // Move all external functions to the end
        collateralReserve.requestTransfer(
            msg.sender,
            address(collateralToken),
            _collateralReceived
        );

        collateralReserve.requestTransfer(
            address(this),
            address(collateralToken),
            _fee
        );

        synth.burnFrom(msg.sender, _synthAmount);
    }

    // Redeem Synth for Share. 0% collateral-backed
    function redeemAlgorithmicSynth(uint256 _synthAmount, uint256 _shareOutMin)
        external
        notRedeemPaused
    {
        require(block.number >= lastAction[msg.sender].add(actionDelay));
        require(synth.balanceOf(msg.sender) >= _synthAmount, "No enough synth");

        uint256 _tcr = collateralReserve.globalCollateralRatio();
        require(_tcr == 0, "Collateral ratio must be 0");

        uint256 _sharePrice = collateralReserve.getSharePrice();
        uint256 _synthPrice = getSynthPrice();

        uint256 _synthDollarValue = _synthAmount.mul(_synthPrice).div(
            PRICE_PRECISION
        );

        uint256 _shareAmount = _synthDollarValue.mul(PRICE_PRECISION).div(
            _sharePrice
        );

        uint256 _shareReceived = _shareAmount
            .mul(FEE_PRECISION.sub(redemptionFee))
            .div(FEE_PRECISION);

        lastAction[msg.sender] = block.number;

        require(_shareOutMin <= _shareReceived, "Slippage limit reached");

        // Move all external functions to the end
        synth.burnFrom(msg.sender, _synthAmount);
        share.mint(msg.sender, _shareReceived);
    }

    // Will fail if fully collateralized or algorithmic
    // Redeem Synth for collateral and Share. > 0% and < 100% collateral-backed
    function redeemFractionalSynth(
        uint256 _synthAmount,
        uint256 _shareOutMin,
        uint256 _minCollateralAmountOut
    ) external notRedeemPaused {
        require(block.number >= lastAction[msg.sender].add(actionDelay));
        require(synth.balanceOf(msg.sender) >= _synthAmount, "No enough synth");

        uint256 _tcr = collateralReserve.globalCollateralRatio();

        require(
            _tcr < COLLATERAL_RATIO_MAX && _tcr > 0,
            "Collateral ratio needs to be lower than 100% or higher than 0%"
        );

        uint256 _sharePrice = collateralReserve.getSharePrice();
        uint256 _synthPrice = getSynthPrice();
        uint256 _collateralPrice = getCollateralPrice();

        uint256 _synthAmountPostFee = (
            _synthAmount.mul(FEE_PRECISION.sub(redemptionFee))
        ).div(FEE_PRECISION);

        uint256 _synthDollarValue = _synthAmountPostFee.mul(_synthPrice).div(
            PRICE_PRECISION
        );

        uint256 _fee = _synthAmount.sub(_synthAmountPostFee);

        uint256 _shareReceived = _synthDollarValue
            .mul(COLLATERAL_RATIO_PRECISION.sub(_tcr))
            .div(_sharePrice);

        uint256 _collateralReceived = _synthDollarValue.mul(_tcr).div(
            _collateralPrice
        );

        require(
            _collateralReceived <=
                collateralToken.balanceOf(address(collateralReserve)),
            "Not enough collateral in pool"
        );
        require(
            _minCollateralAmountOut <= _collateralReceived,
            "Slippage limit reached [Collateral]"
        );

        require(
            _shareOutMin <= _shareReceived,
            "Slippage limit reached [Share]"
        );

        lastAction[msg.sender] = block.number;

        // Move all external functions to the end
        synth.burnFrom(msg.sender, _synthAmount);
        synth.mint(address(this), _fee);
        share.mint(msg.sender, _shareReceived);
        collateralReserve.requestTransfer(
            msg.sender,
            address(collateralToken),
            _collateralReceived
        );
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function toggleMinting() external {
        require(hasRole(PAUSER, msg.sender), "Caller is not a pauser");
        mintPaused = !mintPaused;

        emit MintingToggled(mintPaused);
    }

    function toggleRedeeming() external {
        require(hasRole(PAUSER, msg.sender), "Caller is not a pauser");
        redeemPaused = !redeemPaused;

        emit RedeemingToggled(redeemPaused);
    }

    function setActionDelay(uint256 _newDelay) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_newDelay > 0, "Delay should not be zero");
        actionDelay = _newDelay;
    }

    function setMintingFee(uint256 _new) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_new <= MAX_FEE, "The new fee is too high");
        mintingFee = _new;
        emit SetMintingFee(mintingFee);
    }

    function setRedemptionFee(uint256 _new) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_new <= MAX_FEE, "The new fee is too high");
        redemptionFee = _new;
        emit SetRedemptionFee(redemptionFee);
    }

    function withdrawFee() external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        collateralToken.transfer(
            msg.sender,
            collateralToken.balanceOf(address(this))
        );
        synth.transfer(msg.sender, synth.balanceOf(address(this)));
        share.transfer(msg.sender, share.balanceOf(address(this)));
    }

    function setCollateralReserve(address _collateralReserve) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        collateralReserve = StableCollateralReserve(_collateralReserve);
    }

    /* ========== EVENTS ========== */

    event MintingToggled(bool toggled);
    event RedeemingToggled(bool toggled);
    event CollateralPriceToggled(bool toggled);
    event SetMintingFee(uint256 newFee);
    event SetRedemptionFee(uint256 newFee);

    uint256[49] private __gap;
}
