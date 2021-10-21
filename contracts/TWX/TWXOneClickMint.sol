// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../Interfaces/ITWAP.sol";
import "../Interfaces/ISynthPool.sol";
import "../Interfaces/IUniswapV2Router.sol";
import "./CollateralReserve.sol";
import "hardhat/console.sol";

pragma solidity 0.6.12;

contract OneClickMint is AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    /* ========== STATE VARIABLES ========== */

    ITWAP public oracle;
    IERC20 public collateral;
    IERC20 public share;
    CollateralReserve public collateralReserve;

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
        CollateralReserve _collateralReserve,
        IERC20 _share,
        IERC20 _collateral,
        ITWAP _oracleCollateral,
        address _owner
    ) external initializer {
        collateralReserve = _collateralReserve;
        share = _share; // TWX
        collateral = _collateral; // KUSD
        oracle = _oracleCollateral; // KUSD Oracle

        __AccessControl_init();
        __ReentrancyGuard_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        grantRole(MAINTAINER, _owner);
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    function quickMint(
        address _synthPool,
        uint256 _collateralAmount,
        uint256 _swapShareOutMin,
        uint256 _offset,
        uint256 _synthOutMin
    ) external onlyUserOrWhitelistedContracts nonReentrant {
        uint256 _tcr = collateralReserve.globalCollateralRatio();
        uint256 _collateralPrice = oracle.consult(address(collateral), 1e18);
        require(
            address(_synthPool) != address(0),
            "Invalid synth pool address"
        );

        IERC20 _synth = IERC20(ISynthPool(_synthPool).synth());
        require(address(_synth) != address(0), "Invalid synth address");
        require(collateralReserve.getSharePrice() > 0, "Invalid share price");
        require(
            oracle.consult(address(collateral), 1e18) > 0,
            "Invalid collateral price"
        );

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

        uint256 _twxActualAmount = _receivedAmounts[
            _receivedAmounts.length - 1
        ];

        ISynthPool(_synthPool).mintFractionalSynth(
            _remainCollateralAmount,
            _twxActualAmount,
            _synthOutMin
        );

        uint256 _synthReceived = _synth.balanceOf(address(this));
        uint256 _remainingShare = share.balanceOf(address(this));

        // transfer synth to user
        _synth.safeTransfer(msg.sender, _synthReceived);

        // transfer share to user
        share.safeTransfer(msg.sender, _remainingShare);

        emit Swapped(msg.sender, _swapCollateralAmount, _twxActualAmount);
        emit QuickMint(
            msg.sender,
            _collateralAmount,
            _synthReceived,
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

    function setOracle(address _oracle) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        oracle = ITWAP(_oracle);
    }

    function approveAllowance(IERC20 _token, address _spender) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        _token.approve(_spender, 2**256 - 1);
    }

    function revokeAllowance(IERC20 _token, address _spender) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        _token.approve(_spender, 0);
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
        uint256 synthAmount,
        uint256 shareAmount
    );
    event TransferedCollateral(uint256 collateralAmount);
    event TransferedShare(uint256 shareAmount);
}
