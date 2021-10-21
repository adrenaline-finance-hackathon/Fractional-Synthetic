// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20BurnableUpgradeable.sol";
import "hardhat/console.sol";

import "../Interfaces/ITWAP.sol";
import "./SyntheticPool.sol";

contract Synth is ERC20BurnableUpgradeable, AccessControlUpgradeable {
    uint256 public tokenCap;
    ITWAP public synthTWAP;

    bytes32 public constant MAINTAINER = keccak256("MAINTAINER");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER");

    uint256 private constant PRICE_PRECISION = 1e18;

    function initialize(
        address _owner,
        string memory _name,
        string memory _symbol
    ) public initializer {
        tokenCap = 100000 ether;
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ERC20_init_unchained(_name, _symbol);
        __ERC20Burnable_init_unchained();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        grantRole(MAINTAINER, _owner);
    }

    function getSynthPrice() public view returns (uint256) {
        return ITWAP(synthTWAP).consult(address(this), 1e18);
    }

    function setOracle(ITWAP _synthTWAP) public {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a MAINTAINER");
        synthTWAP = _synthTWAP;
        emit SetOracle(address(_synthTWAP));
    }

    function setTokenCap(uint256 _newCap) external {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a MAINTAINER");
        tokenCap = _newCap;
        emit SetTokenCap(_newCap);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function mint(address to, uint256 _amount) external {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");

        uint256 newSupply = totalSupply() + _amount;
        require(newSupply <= tokenCap, "Minting exceed cap");

        _mint(to, _amount);
        emit Mint(to, _amount);
    }

    /* ========== EVENTS ========== */
    event Mint(address to, uint256 amount);
    event SetOracle(address oracle);
    event SetTokenCap(uint256 newCap);

    uint256[49] private __gap;
}
