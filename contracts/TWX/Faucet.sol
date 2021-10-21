// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract FaucetV2 is AccessControlUpgradeable {
    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    IERC20 kusd;
    IERC20 twx;

    bool public isPause;
    uint256 public maxKUSDClaimed;
    uint256 public maxTWXClaimed;

    mapping(address => uint256) public twxClaimed;
    mapping(address => uint256) public kusdClaimed;

    function initialize(
        address _owner,
        IERC20 _kusd,
        IERC20 _twx
    ) public initializer {
        kusd = _kusd;
        twx = _twx;
        maxKUSDClaimed = 1000e18;
        maxTWXClaimed = 1000e18;
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    function claim(uint256 _amount) external {
        require(!isPause, "Contract is paused");
        require(
            kusdClaimed[msg.sender] + _amount <= maxKUSDClaimed,
            "Claim reached maximum amount"
        );
        require(
            kusdClaimed[msg.sender] + _amount <= maxKUSDClaimed,
            "Claim reached maximum amount"
        );

        kusd.transfer(msg.sender, _amount);
        twx.transfer(msg.sender, _amount);

        kusdClaimed[msg.sender] += _amount;
        twxClaimed[msg.sender] += _amount;

        emit Claim(_amount);
    }

    function updateMaxClaim(uint256 _amount) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        maxKUSDClaimed = _amount;
        maxTWXClaimed = _amount;
    }

    function togglePause() external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        isPause = !isPause;
    }

    event Claim(uint256 _amount);

    uint256[49] private __gap;
}
