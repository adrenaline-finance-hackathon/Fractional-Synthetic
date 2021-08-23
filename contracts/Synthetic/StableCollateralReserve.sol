// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

import "../Interfaces/ITWAP.sol";
import "../Interfaces/ITreasuryVault.sol";
import "../Interfaces/ICustomToken.sol";
import "./KUSDPool.sol";
import "./KUSD.sol";

contract StableCollateralReserve is AccessControlUpgradeable {
    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");
    bytes32 private constant RATIO_SETTER = keccak256("RATIO_SETTER");
    bytes32 private constant PAUSER = keccak256("PAUSER");
    bytes32 private constant POOL = keccak256("POOL");

    using SafeMath for uint256;
    using SafeERC20 for ERC20;
    using SafeERC20 for IERC20;

    address public feeCollector;

    /* ========== COLLATERAL ========== */
    // List of allowed collateral
    address[] public collateralAddressArray;
    // Check existing of collateral
    mapping(address => bool) public collateralAddress;

    /* ========== ORACLE ========== */
    // List of oracle
    address[] public oracleArray;

    // Check existing of oracle
    mapping(address => bool) public oracleExist;

    // oracleOf(ERC20()) => TWAP Address
    mapping(address => address) public oracleOf;

    /* ========== Synthetic Pools ========== */
    // list of synth pool
    address[] public synthPoolArray;
    // Check existing of synthetic pool
    mapping(address => bool) public synthPoolExist;

    // list of synth token
    address[] public synthArray;
    // Check existing of synthetic token
    mapping(address => bool) public synthExists;

    // Enable and disable pool
    mapping(address => bool) enabledPool;

    // Global collateral target, set by growth ratio
    uint256 public globalCollateralRatio;

    // Growth ratio calculation and ratio setter (stepUp, stepDown)
    address public pidController;

    address[] public poolArrays;

    uint256 public refreshCooldown; // Seconds to wait before being able to run refreshCollateralRatio()
    uint256 public lastCallTime;

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant RATIO_PRECISION = 1e18;
    uint256 public constant RATIO_UPPER_BOUND = 1e18; //100%
    uint256 public constant RATIO_LOWER_BOUND = 0; //0%
    uint256 public constant MAX_FEE = 5e16; // 5%
    uint256 private constant FEE_PRECISION = 1e18;

    uint256 public bonusRate;
    uint256 public ratioDelta; // Should initially be 25e15 or 0.25%
    uint256 public buybackFee;
    uint256 public recollatFee;
    bool public recollateralizePaused;
    bool public buyBackPaused;

    /* ========== Investment ========== */
    address[] public vaults;
    uint256 public investCollateralRatio;

    ICustomToken public share;
    ITWAP public shareTWAP;

    function initialize(
        address _owner,
        address _pidController,
        address _share,
        address _shareTWAP,
        address _feeCollector
    ) public initializer {
        ratioDelta = 25e14; // 0.25%
        bonusRate = 75e14; // 0.75%
        refreshCooldown = 0;
        globalCollateralRatio = 1e18; // 100%
        pidController = _pidController;
        feeCollector = _feeCollector;

        share = ICustomToken(_share);
        shareTWAP = ITWAP(_shareTWAP);

        __AccessControl_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        grantRole(MAINTAINER, _owner);
        setPIDController(_pidController);

        recollateralizePaused = true;
        buyBackPaused = true;
        investCollateralRatio = 7e17; // 70%
    }

    function globalCollateralValue() public view returns (uint256 _tcv) {
        for (uint256 i = 0; i < collateralAddressArray.length; i++) {
            // Exclude null addresses
            if (collateralAddressArray[i] != address(0)) {
                uint256 _totalBalance = IERC20(collateralAddressArray[i])
                    .balanceOf(address(this));

                uint256 _price = ITWAP(oracleOf[collateralAddressArray[i]])
                    .consult(collateralAddressArray[i], 1e18);

                _tcv = _tcv.add(_totalBalance.mul(_price).div(PRICE_PRECISION));
            }
        }
    }

    function totalGlobalSynthValue() public view returns (uint256 _tgsv) {
        for (uint256 i = 0; i < synthArray.length; i++) {
            if (synthArray[i] != address(0)) {
                uint256 _totalSupply = IERC20(synthArray[i]).totalSupply();
                uint256 _price = KUSD(synthArray[i]).getSynthPrice();
                _tgsv = _tgsv.add(
                    _totalSupply.mul(_price).div(PRICE_PRECISION)
                );
            }
        }
    }

    function getECR() public view returns (uint256) {
        uint256 collateralValue = globalCollateralValue();
        uint256 marketCap = totalGlobalSynthValue();
        return collateralValue.mul(PRICE_PRECISION).div(marketCap);
    }

    function getCollateralTokenValue(address _collateralToken)
        public
        view
        returns (uint256)
    {
        return IERC20(_collateralToken).balanceOf(address(this)); //TODO + vault[col]
    }

    // Returns the price of the pool collateral in USD
    function getSharePrice() public view returns (uint256) {
        return ITWAP(shareTWAP).consult(address(share), 1e18);
    }

    // Function can be called by an Share holder to have the protocol buy back Share with excess collateral value from a desired collateral pool
    // This can also happen if the collateral ratio > 1
    function buyBackShare(
        uint256 _shareAmount,
        uint256 _collateralOutMin,
        address _collateralToken
    ) external {
        require(buyBackPaused == false, "Buyback is paused");
        require(share.balanceOf(msg.sender) >= _shareAmount, "No enough Share");

        uint256 excessCollateralBalance = excessCollateralBalance(
            _collateralToken
        );

        require(
            excessCollateralBalance > 0,
            "No excess collateral to buy back!"
        );

        uint256 _sharePrice = getSharePrice();
        uint256 _requireShareValue = _shareAmount.mul(_sharePrice).div(
            PRICE_PRECISION
        );

        uint256 _collateralPrice = ITWAP(oracleOf[_collateralToken]).consult(
            _collateralToken,
            1e18
        );

        uint256 _collateralEquivalent = _shareAmount.mul(_sharePrice).div(
            _collateralPrice
        );

        uint256 _excessCollateralValue = excessCollateralBalance
            .mul(_collateralPrice)
            .div(PRICE_PRECISION);

        require(
            _requireShareValue <= _excessCollateralValue,
            "Buyback over excess balance"
        );

        uint256 _collateralEquivalentReceived = _collateralEquivalent
            .mul(FEE_PRECISION.sub(buybackFee))
            .div(FEE_PRECISION);

        require(
            IERC20(_collateralToken).balanceOf(address(this)) >=
                _collateralEquivalentReceived,
            "Not enough available excess collateral token"
        );

        uint256 _fee = _collateralEquivalent.sub(_collateralEquivalentReceived);

        require(
            _collateralOutMin <= _collateralEquivalentReceived,
            "Slippage limit reached"
        );

        share.burnFrom(msg.sender, _shareAmount);
        IERC20(_collateralToken).transfer(
            msg.sender,
            _collateralEquivalentReceived
        );
        IERC20(_collateralToken).transfer(feeCollector, _fee);
    }

    function excessCollateralBalance(address _collateralToken)
        public
        view
        returns (uint256 _totalExcess)
    {
        uint256 _tcr = globalCollateralRatio;
        uint256 _ecr = getECR();
        if (_ecr <= _tcr) {
            return 0;
        }

        uint256 _collateralPrice = ITWAP(oracleOf[_collateralToken]).consult(
            _collateralToken,
            1e18
        );

        uint256 _targetCollateralValue = totalGlobalSynthValue().mul(_tcr).div(
            PRICE_PRECISION
        );

        uint256 _collateralValueExcess = globalCollateralValue().sub(
            _targetCollateralValue
        );

        _totalExcess = _collateralValueExcess.mul(PRICE_PRECISION).div(
            _collateralPrice
        );
    }

    function getMaxBuybackShare(address _collateralToken)
        external
        view
        returns (uint256 _maxShare)
    {
        uint256 _excessCollateralBalance = excessCollateralBalance(
            _collateralToken
        );

        uint256 _collateralPrice = ITWAP(oracleOf[_collateralToken]).consult(
            _collateralToken,
            1e18
        );

        uint256 _excessCollateralValue = _excessCollateralBalance
            .mul(_collateralPrice)
            .div(PRICE_PRECISION);

        uint256 _excessCollateralValuePostFee = _excessCollateralValue
            .mul(RATIO_PRECISION.sub(buybackFee))
            .div(RATIO_PRECISION);

        uint256 _multiplier = _excessCollateralValue.mul(RATIO_PRECISION).div(
            _excessCollateralValuePostFee
        );

        uint256 _sharePrice = getSharePrice();

        _maxShare = _excessCollateralValue.mul(_multiplier).div(_sharePrice);
    }

    function recollateralizeAmount(address _collateralToken)
        public
        view
        returns (uint256 _collateralNeeded)
    {
        uint256 _ecr = getECR();
        uint256 _tcr = globalCollateralRatio;

        if (_tcr <= _ecr) {
            return 0;
        }

        uint256 _collateralPrice = ITWAP(oracleOf[_collateralToken]).consult(
            _collateralToken,
            1e18
        );

        uint256 _targetCollateralValue = totalGlobalSynthValue().mul(_tcr).div(
            PRICE_PRECISION
        );

        uint256 _collateralValueNeeded = _targetCollateralValue.sub(
            globalCollateralValue()
        );

        _collateralNeeded = _collateralValueNeeded.mul(PRICE_PRECISION).div(
            _collateralPrice
        );
    }

    // When the protocol is recollateralizing, we need to give a discount of Share to hit the new CR target
    // Thus, if the target collateral ratio is higher than the actual value of collateral, minters get Share for adding collateral
    // This function simply rewards anyone that sends collateral to a pool with the same amount of Share + the bonus rate
    // Anyone can call this function to recollateralize the protocol and take the extra Share value from the bonus rate as an arb opportunity
    function recollateralizeShare(
        address _collateralToken,
        uint256 _collateralAmount,
        uint256 _shareOutMin
    ) external {
        require(recollateralizePaused == false, "Recollateralize is paused");

        uint256 _collateralPrice = ITWAP(oracleOf[_collateralToken]).consult(
            _collateralToken,
            1e18
        );

        uint256 _recollateralizeValue = recollateralizeAmount(_collateralToken)
            .mul(_collateralPrice)
            .div(PRICE_PRECISION);

        require(_recollateralizeValue > 0, "insufficient collateral");

        uint256 _requestCollateralValue = ITWAP(oracleOf[_collateralToken])
            .consult(_collateralToken, 1e18)
            .mul(_collateralAmount)
            .div(PRICE_PRECISION);

        require(
            _requestCollateralValue <= _recollateralizeValue,
            "Request recollateralize over limit"
        );

        uint256 _sharePaidBack = _requestCollateralValue
            .mul(PRICE_PRECISION.add(bonusRate))
            .div(getSharePrice());

        uint256 _sharePaidBackReceived = _sharePaidBack
            .mul(FEE_PRECISION.sub(recollatFee))
            .div(FEE_PRECISION);

        require(
            _shareOutMin <= _sharePaidBackReceived,
            "Slippage limit reached"
        );

        uint256 _fee = _sharePaidBack.sub(_sharePaidBackReceived);

        IERC20(_collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            _collateralAmount
        );
        share.mint(msg.sender, _sharePaidBackReceived);
        share.mint(feeCollector, _fee);
    }

    /* ========== Roles ========== */
    function setPIDController(address _pidController) public {
        require(hasRole(MAINTAINER, msg.sender));
        grantRole(RATIO_SETTER, _pidController);
        pidController = _pidController;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setFeeCollector(address _newFeeCollector) external {
        require(hasRole(MAINTAINER, msg.sender));
        feeCollector = _newFeeCollector;
    }

    function setBonusRate(uint256 _newBonusRate) external {
        require(hasRole(MAINTAINER, msg.sender));
        bonusRate = _newBonusRate;
    }

    function setBuybackFee(uint256 _newBuybackFee) external {
        require(hasRole(MAINTAINER, msg.sender));
        require(_newBuybackFee <= MAX_FEE, "The new fee is to high");
        buybackFee = _newBuybackFee;
        emit SetBuybackFee(buybackFee);
    }

    function setRecollatFee(uint256 _newRecollatFee) external {
        require(hasRole(MAINTAINER, msg.sender));
        require(_newRecollatFee <= MAX_FEE, "The new fee is to high");
        recollatFee = _newRecollatFee;
        emit SetRecollatFee(recollatFee);
    }

    function toggleRecollateralize() external {
        require(hasRole(PAUSER, msg.sender));
        recollateralizePaused = !recollateralizePaused;

        emit RecollateralizeToggled(recollateralizePaused);
    }

    function toggleBuyBack() external {
        require(hasRole(PAUSER, msg.sender));
        buyBackPaused = !buyBackPaused;

        emit BuybackToggled(buyBackPaused);
    }

    function setShareTWAP(address _new) external {
        require(hasRole(MAINTAINER, msg.sender));
        shareTWAP = ITWAP(_new);
    }

    function requestTransfer(
        address _receiver,
        address _token,
        uint256 _amount
    ) external {
        require(hasRole(POOL, msg.sender), "Sender is not a pool");
        IERC20(_token).transfer(_receiver, _amount);
    }

    function setRefreshCooldown(uint256 newCooldown) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        refreshCooldown = newCooldown;
    }

    // Adds collateral addresses supported, such as tether and busd, must be ERC20
    function addCollateralAddress(
        address _collateralTokenAddress,
        address _oracle
    ) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_collateralTokenAddress != address(0), "Zero address detected");

        require(
            collateralAddress[_collateralTokenAddress] == false,
            "Address already exists"
        );

        require(oracleExist[_oracle], "Oracle is not exists");

        collateralAddress[_collateralTokenAddress] = true;
        collateralAddressArray.push(_collateralTokenAddress);
        oracleOf[_collateralTokenAddress] = _oracle;

        emit AddCollateralToken(_collateralTokenAddress);
    }

    function addOracle(address _oracle) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_oracle != address(0), "Zero address detected");

        require(oracleExist[_oracle] == false, "Address already exists");

        oracleExist[_oracle] = true;
        oracleArray.push(_oracle);

        emit AddOracle(_oracle);
    }

    function setOracleOf(address _token, address _oracle) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_oracle != address(0), "Zero address detected");

        oracleOf[_token] = _oracle;
    }

    function addPool(address poolAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(poolAddress != address(0), "Zero address detected");

        require(synthPoolExist[poolAddress] == false, "Address already exists");
        synthPoolExist[poolAddress] = true;
        synthPoolArray.push(poolAddress);

        grantRole(POOL, poolAddress);

        emit PoolAdded(poolAddress);
    }

    function addSynth(address _synthAddress) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_synthAddress != address(0), "Zero address detected");

        require(synthExists[_synthAddress] == false, "Address already exists");
        synthExists[_synthAddress] = true;
        synthArray.push(_synthAddress);

        emit AddSynthToken(_synthAddress);
    }

    // Remove a pool
    function removePool(address poolAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(poolAddress != address(0), "Zero address detected");
        require(synthPoolExist[poolAddress] == true, "Address nonexistant");

        // Delete from the mapping
        delete synthPoolExist[poolAddress];

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < synthPoolArray.length; i++) {
            if (synthPoolArray[i] == poolAddress) {
                synthPoolArray[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }

        revokeRole(POOL, poolAddress);

        emit PoolRemoved(poolAddress);
    }

    function removeCollateral(address _collateralAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_collateralAddress != address(0), "Zero address detected");
        require(
            collateralAddress[_collateralAddress] == true,
            "Address nonexistant"
        );

        // Delete from the mapping
        delete collateralAddress[_collateralAddress];

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < collateralAddressArray.length; i++) {
            if (collateralAddressArray[i] == _collateralAddress) {
                collateralAddressArray[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }

        // also remove oracle of this token
        if (oracleOf[_collateralAddress] != address(0)) {
            removeOracle(oracleOf[_collateralAddress]);
        }

        emit CollateralTokenRemoved(_collateralAddress);
    }

    function removeSynth(address synthAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(synthAddress != address(0), "Zero address detected");
        require(synthExists[synthAddress] == true, "Address nonexistant");

        // Delete from the mapping
        delete synthExists[synthAddress];

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < synthArray.length; i++) {
            if (synthArray[i] == synthAddress) {
                synthArray[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }

        emit SynthTokenRemoved(synthAddress);
    }

    function removeOracle(address oracleAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(oracleAddress != address(0), "Zero address detected");
        require(oracleExist[oracleAddress] == true, "Address nonexistant");

        // Delete from the mapping
        delete oracleExist[oracleAddress];

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < oracleArray.length; i++) {
            if (oracleArray[i] == oracleAddress) {
                oracleArray[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }

        emit OracleRemoved(oracleAddress);
    }

    function toggleEnablePool(address _pool) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        enabledPool[_pool] = !enabledPool[_pool];
    }

    function setRatioDelta(uint256 _delta) external {
        require(hasRole(RATIO_SETTER, msg.sender));
        require(
            block.timestamp - lastCallTime >= refreshCooldown,
            "Must wait for the refresh cooldown since last refresh"
        );
        ratioDelta = _delta;
    }

    function setGlobalCollateralRatio(uint256 newRatio) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(
            newRatio <= RATIO_UPPER_BOUND && newRatio >= RATIO_LOWER_BOUND,
            "New ratio exceed bound"
        );
        globalCollateralRatio = newRatio;
        lastCallTime = block.timestamp; // Set the time of the last expansion

        emit SetGlobalCollateralRatio(globalCollateralRatio);
    }

    function stepUpTCR() external {
        require(
            hasRole(RATIO_SETTER, msg.sender),
            "Sender is not a ratio setter"
        );
        require(
            block.timestamp - lastCallTime >= refreshCooldown,
            "Must wait for the refresh cooldown since last refresh"
        );

        globalCollateralRatio = globalCollateralRatio.add(ratioDelta);

        if (globalCollateralRatio > RATIO_UPPER_BOUND) {
            globalCollateralRatio = RATIO_UPPER_BOUND;
        }

        lastCallTime = block.timestamp; // Set the time of the last expansion

        emit SetGlobalCollateralRatio(globalCollateralRatio);
    }

    function stepDownTCR() external {
        require(
            hasRole(RATIO_SETTER, msg.sender),
            "Sender is not a ratio setter"
        );
        require(
            block.timestamp - lastCallTime >= refreshCooldown,
            "Must wait for the refresh cooldown since last refresh"
        );

        globalCollateralRatio = globalCollateralRatio.sub(ratioDelta);
        require(
            globalCollateralRatio >= RATIO_LOWER_BOUND,
            "New ratio exceed bound"
        );

        lastCallTime = block.timestamp; // Set the time of the last expansion
        emit SetGlobalCollateralRatio(globalCollateralRatio);
    }

    /* ================ Investment - Vault ================ */

    function addVault(address _vault) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_vault != address(0), "invalidAddress");

        vaults.push(_vault);
        emit VaultAdded(_vault);
    }

    function removeVault(address _vault) external {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        require(_vault != address(0), "invalidAddress");

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < vaults.length; i++) {
            if (vaults[i] == _vault) {
                vaults[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }
        emit VaultRemoved(_vault);
    }

    function recallFromVault(uint256 index) public {
        require(hasRole(MAINTAINER, msg.sender));

        _recallFromVault(index);
    }

    function enterVault(uint256 index) public {
        require(hasRole(MAINTAINER, msg.sender));
        _enterVault(index);
    }

    function rebalanceVault(uint256 index) external {
        require(hasRole(MAINTAINER, msg.sender));
        _recallFromVault(index);
        _enterVault(index);
    }

    function _recallFromVault(uint256 index) internal {
        require(vaults[index] != address(0), "Vault does not exist");

        ITreasuryVault(vaults[index]).withdraw();
    }

    function _enterVault(uint256 index) internal {
        require(vaults[index] != address(0), "No vault");

        ITreasuryVault vault = ITreasuryVault(vaults[index]);

        IERC20 _collateral = IERC20(vault.asset());

        // 1. check balance
        uint256 _collateralBalance = _collateral.balanceOf(address(this));

        require(_collateralBalance > 0, "Collateral Balance is zero");

        // 2. now pools should contain all collaterals. we will calc how much to use
        uint256 _investmentAmount = (
            investCollateralRatio.mul(_collateralBalance)
        ).div(RATIO_PRECISION);

        if (_investmentAmount > 0) {
            _collateral.safeApprove(address(vault), 0);
            _collateral.safeApprove(address(vault), _investmentAmount);
            vault.deposit(_investmentAmount);
        }
    }

    /* ========== EVENTS ========== */
    event SetGlobalCollateralRatio(uint256 newRatio);
    event PoolAdded(address newPool);
    event PoolRemoved(address newPool);
    event AddCollateralToken(address newCollateral);
    event AddSynthToken(address newSynth);
    event AddOracle(address newOracle);
    event CollateralTokenRemoved(address collateral);
    event SynthTokenRemoved(address synth);
    event OracleRemoved(address oracle);
    event VaultAdded(address newVault);
    event VaultRemoved(address newVault);
    event SetBuybackFee(uint256 newFee);
    event SetRecollatFee(uint256 newFee);
    event RecollateralizeToggled(bool toggled);
    event BuybackToggled(bool toggled);

    uint256[49] private __gap;
}
