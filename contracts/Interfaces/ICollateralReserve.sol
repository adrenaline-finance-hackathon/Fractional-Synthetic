// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ICollateralReserve {
    function collateralValue(address) external returns (uint256);

    function globalCollateralValue() external view returns (uint256 _tcv);

    function totalGlobalSynthValue() external view returns (uint256 _tgsv);

    function getECR() external view returns (uint256);

    function getCollateralTokenValue(address _collateralToken)
        external
        view
        returns (uint256);

    // Returns the price of the pool collateral in USD
    function getSharePrice() external view returns (uint256);

    // Function can be called by an TWX holder to have the protocol buy back TWX with excess collateral value from a desired collateral pool
    // This can also happen if the collateral ratio > 1
    function buyBackShare(
        uint256 _twxAmount,
        uint256 _collateralOutMin,
        address _collateralToken
    ) external;

    function excessCollateralBalance()
        external
        view
        returns (uint256 _totalExcess);

    function recollateralizeAmount()
        external
        view
        returns (uint256 _collateralNeeded);

    // When the protocol is recollateralizing, we need to give a discount of TWX to hit the new CR target
    // Thus, if the target collateral ratio is higher than the actual value of collateral, minters get TWX for adding collateral
    // This function simply rewards anyone that sends collateral to a pool with the same amount of TWX + the bonus rate
    // Anyone can call this function to recollateralize the protocol and take the extra TWX value from the bonus rate as an arb opportunity
    function recollateralizeShare(
        address _collateralToken,
        uint256 _collateralAmount,
        uint256 _twxOutMin
    ) external;

    /* ========== Roles ========== */
    function setPIDController(address _pidController) external;

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setFeeCollector(address _newFeeCollector) external;

    function setBonusRate(uint256 _newBonusRate) external;

    function setBuybackFee(uint256 _newBuybackFee) external;

    function setRecollatFee(uint256 _newRecollatFee) external;

    function toggleRecollateralize() external;

    function toggleBuyBack() external;

    function TWAP(address _new) external;

    function requestTransfer(
        address _receiver,
        address _token,
        uint256 _amount
    ) external;

    function setRefreshCooldown(uint256 newCooldown) external;

    // Adds collateral addresses supported, such as tether and busd, must be ERC20
    function addCollateralAddress(
        address _collateralTokenAddress,
        address _oracle
    ) external;

    function addOracle(address _oracle) external;

    function setOracleOf(address _token, address _oracle) external;

    // Adds collateral addresses supported, such as tether and busd, must be ERC20
    function addPool(address poolAddress) external;

    // Remove a pool
    function removePool(address poolAddress) external;

    function toggleEnablePool(address _pool) external;

    function setRatioDelta(uint256 _delta) external;

    function setGlobalCollateralRatio(uint256 newRatio) external;

    function stepUpTCR() external;

    function stepDownTCR() external;

    /* ================ Investment - Vault ================ */

    function addVault(address _vault) external;

    function removeVault(address _vault) external;

    function recallFromVault(uint256 index) external;

    function enterVault(uint256 index) external;

    function rebalanceVault(uint256 index) external;
}
