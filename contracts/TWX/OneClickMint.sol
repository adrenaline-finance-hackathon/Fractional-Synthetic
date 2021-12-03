// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../Interfaces/ITWAP.sol";
import "../Interfaces/IKUSDPool.sol";
import "../Interfaces/IUniswapV2Router.sol";
import "./StableCollateralReserve.sol";
import "hardhat/console.sol";

pragma solidity 0.6.12;

contract OneClickMint is AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    /* ========== STATE VARIABLES ========== */

    ITWAP public oracle;
    IERC20 public kusd;
    IERC20 public collateral;
    IERC20 public share;
    StableCollateralReserve public collateralReserve;
    IKUSDPool public kusdPool;

    IUniswapV2Router public router;
    address[] public routerPath;
    mapping(address => bool) public whitelistContracts;

    // Constants for various precisions
    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 private constant LIMIT_SWAP_TIME = 10 minutes;

    modifier onlyUserOrWhitelistedContracts() {
        require(
            msg.sender == tx.origin || whitelistContracts[msg.sender],
            "Allow non-contract only"
        );
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    function initialize(
        StableCollateralReserve _collateralReserve,
        IKUSDPool _kusdPool,
        IERC20 _kusd,
        IERC20 _share,
        IERC20 _collateral,
        ITWAP _oracleCollateral,
        address _owner
    ) external initializer {
        collateralReserve = _collateralReserve;
        kusdPool = _kusdPool;
        kusd = _kusd; // KUSD
        share = _share; // DOPX
        collateral = _collateral; // USDC
        oracle = _oracleCollateral; // USDC Oracle

        __AccessControl_init();
        __ReentrancyGuard_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        grantRole(MAINTAINER, _owner);
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    function quickMint(
        uint256 _collateralAmount,
        uint256 _swapShareOutMin,
        uint256 _offset,
        uint256 _kusdOutMin
    ) external onlyUserOrWhitelistedContracts nonReentrant {
        uint256 _sharePrice = collateralReserve.getSharePrice();
        uint256 _tcr = collateralReserve.globalCollateralRatio();
        uint256 _collateralPrice = oracle.consult(address(collateral), 1e18);

        require(_sharePrice > 0, "Invalid share price");
        require(_collateralPrice > 0, "Invalid collateral price");

        uint256 _collateralValue = _collateralAmount.mul(_collateralPrice).div(
            PRICE_PRECISION
        );

        // offset depends on price impact when swapping
        uint256 _swapCollateralAmount = _collateralValue
            .mul(PRICE_PRECISION - _tcr + _offset)
            .div(_collateralPrice);

        uint256 _remainCollateralAmount = _collateralAmount.sub(
            _swapCollateralAmount
        );

        collateral.safeTransferFrom(
            msg.sender,
            address(this),
            _collateralAmount
        );

        //  swap collateral to share
        uint256[] memory _receivedAmounts = router.swapExactTokensForTokens(
            _swapCollateralAmount,
            _swapShareOutMin,
            routerPath,
            address(this),
            block.timestamp + LIMIT_SWAP_TIME
        );

        uint256 _dopxActualAmount = _receivedAmounts[
            _receivedAmounts.length - 1
        ];

        kusdPool.mintFractionalSynth(
            _remainCollateralAmount,
            _dopxActualAmount,
            _kusdOutMin
        );

        uint256 _kusdReceived = kusd.balanceOf(address(this));
        uint256 _remainingShare = share.balanceOf(address(this));

        // transfer kusd to user
        kusd.safeTransfer(msg.sender, _kusdReceived);

        // transfer share to user
        share.safeTransfer(msg.sender, _remainingShare);

        emit Swapped(msg.sender, _swapCollateralAmount, _dopxActualAmount);
        emit QuickMint(
            msg.sender,
            _collateralAmount,
            _kusdReceived,
            _remainingShare
        );
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setRouter(address _router, address[] calldata _path) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_router != address(0), "Invalid router");
        router = IUniswapV2Router(_router);
        routerPath = _path;
    }

    function addWhitelistContract(address _contract) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_contract != address(0), "Invalid address");
        require(!whitelistContracts[_contract], "Contract was whitelisted");
        whitelistContracts[_contract] = true;
    }

    function removeWhitelistContract(address _contract) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(whitelistContracts[_contract], "Contract was not whitelisted");
        delete whitelistContracts[_contract];
    }

    function approveAllowance(IERC20 _token, address _spender) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        _token.safeApprove(_spender, type(uint256).max);
    }

    function revokeAllowance(IERC20 _token, address _spender) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(_token.approve(_spender, 0));
    }

    /* ========== EVENTS ========== */

    event Swapped(
        address indexed user,
        uint256 collateralAmount,
        uint256 shareAmount
    );
    event QuickMint(
        address indexed user,
        uint256 collateralAmount,
        uint256 kusdAmount,
        uint256 shareAmount
    );
    event TransferedCollateral(uint256 collateralAmount);
    event TransferedShare(uint256 shareAmount);
}
