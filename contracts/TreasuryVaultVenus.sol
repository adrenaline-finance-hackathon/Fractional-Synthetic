// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// inherited
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

// interfaces
import "./Interfaces/IComptroller.sol";
import "./Interfaces/IVToken.sol";

contract TreasuryVaultVenus is
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    IERC20 public asset;

    address public treasury;

    IVToken public vToken;
    IComptroller public vComptroller;

    uint256 public vaultBalance;

    address public dev;

    // EVENTS
    event TreasuryChanged(address indexed newTreasury);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

    event Profited(uint256 amount);
    event IncentivesClaimed(uint256 amount);

    // MODIFIERS

    modifier onlyTreasury() {
        require(_msgSender() == treasury, "!treasury");
        _;
    }

    modifier onlyOwner() {
        require(hasRole(MAINTAINER, msg.sender), "Sender is not a maintainer");
        _;
    }

    // Constructor

    function initialize(
        address _dev,
        address _asset,
        address _treasury,
        address _vToken
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _dev);
        grantRole(MAINTAINER, _dev);

        dev = _dev;

        asset = IERC20(_asset);
        treasury = _treasury;

        vToken = IVToken(_vToken);
        vComptroller = IComptroller(_getComptroller());

        // check asset equal to underlying
        require(vToken.underlying() == _asset, "asset != underlying");
    }

    // TREASURY functions

    function deposit(uint256 _amount) external onlyTreasury {
        require(_amount > 0, "amount = 0");
        asset.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 newBalance = asset.balanceOf(address(this)); // invest everything in vault
        vaultBalance = newBalance.add(vaultBalance);
        asset.safeApprove(address(vToken), 0);
        asset.safeApprove(address(vToken), newBalance);
        vToken.mint(newBalance);
        emit Deposited(_amount);
    }

    function withdraw() external onlyTreasury {
        vToken.redeem(balanceOfVToken());

        uint256 newBalance = asset.balanceOf(address(this)); // withdraw everything in vault
        uint256 profit = 0;
        if (newBalance > vaultBalance) {
            profit = newBalance - vaultBalance;
        }
        if (profit > 0) {
            asset.safeTransfer(dev, profit);
            newBalance = asset.balanceOf(address(this)); // withdraw everything in vault
        }

        asset.safeTransfer(treasury, newBalance);
        vaultBalance = asset.balanceOf(address(this));
        emit Withdrawn(newBalance);
        emit Profited(profit);
    }

    function claimIncentiveRewards() external onlyOwner {
        uint256 unclaimedRewards = getUnclaimedIncentiveRewardsBalance();
        address[] memory _tokens = new address[](1);
        _tokens[0] = address(vToken);
        vComptroller.claimVenus(dev, _tokens); // claim directly to owner
        emit IncentivesClaimed(unclaimedRewards);
    }

    function balanceOfAsset() public view returns (uint256) {
        (
            ,
            uint256 vTokenBalance,
            ,
            uint256 exchangeRateMantissa
        ) = getAccountSnapshot();

        // vTokens are 8 decimals
        // onevTokenInUnderlying = exchangeRateCurrent / (1  *  10  ^  (18  + underlyingDecimals - vTokenDecimals)
        uint256 assetBalance = vTokenBalance.mul(exchangeRateMantissa).div(
            1e18
        );
        return assetBalance;
    }

    function getProfit() public view returns (uint256 profit, uint256 penalty) {
        uint256 balanceAssetFromVToken = balanceOfAsset();
        if (balanceAssetFromVToken > vaultBalance) {
            profit = balanceAssetFromVToken.sub(vaultBalance);
        } else {
            penalty = vaultBalance.sub(balanceAssetFromVToken);
        }
    }

    function getUnclaimedIncentiveRewardsBalance()
        public
        view
        returns (uint256)
    {
        return vComptroller.venusAccrued(address(this));
    }

    function balanceOfVToken() public view returns (uint256) {
        return vToken.balanceOf(address(this));
    }

    function getAccountSnapshot()
        public
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return vToken.getAccountSnapshot(address(this));
    }

    function _getComptroller() internal view returns (address) {
        return vToken.comptroller();
    }

    // ===== VAULT ADMIN FUNCTIONS ===============
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function executeTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data
    ) public onlyOwner returns (bytes memory) {
        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(
                bytes4(keccak256(bytes(signature))),
                data
            );
        }
        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{value: value}(
            callData
        );
        require(
            success,
            string(
                "TreasuryVaultVenus::executeTransaction: Transaction execution reverted."
            )
        );
        return returnData;
    }

    receive() external payable {}
}
