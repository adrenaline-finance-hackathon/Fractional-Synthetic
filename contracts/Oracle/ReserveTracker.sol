// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../Uniswap/Interfaces/IUniswapV2Pair.sol";

contract ReserveTracker is AccessControlUpgradeable {
    using SafeMath for uint256;

    bytes32 private constant MAINTAINER = keccak256("MAINTAINER");

    // Contract addresses
    address private shareContractAddress;

    // Array of pairs for Share
    address[] public sharePairsArray;

    // Mapping is also used for faster verification
    mapping(address => bool) public sharePairs;

    uint256 public shareReserves;

    function initialize(address _shareContractAddress) public initializer {
        shareContractAddress = _shareContractAddress;

        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MAINTAINER, msg.sender);
    }

    function getShareReserves() public view returns (uint256) {
        uint256 totalShareReserves = 0;

        for (uint256 i = 0; i < sharePairsArray.length; i++) {
            // Exclude null addresses
            if (sharePairsArray[i] != address(0)) {
                if (
                    IUniswapV2Pair(sharePairsArray[i]).token0() ==
                    shareContractAddress
                ) {
                    (uint256 reserves0, , ) = IUniswapV2Pair(sharePairsArray[i])
                        .getReserves();
                    totalShareReserves = totalShareReserves.add(reserves0);
                } else if (
                    IUniswapV2Pair(sharePairsArray[i]).token1() ==
                    shareContractAddress
                ) {
                    (, uint256 reserves1, ) = IUniswapV2Pair(sharePairsArray[i])
                        .getReserves();
                    totalShareReserves = totalShareReserves.add(reserves1);
                }
            }
        }

        return totalShareReserves;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // Adds collateral addresses supported, such as tether and busd, must be ERC20
    function addSharePair(address pairAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(sharePairs[pairAddress] == false, "Address already exists");

        sharePairs[pairAddress] = true;
        sharePairsArray.push(pairAddress);
    }

    // Remove a pool
    function removeSharePair(address pairAddress) public {
        require(hasRole(MAINTAINER, msg.sender), "Caller is not a maintainer");
        require(sharePairs[pairAddress] == true, "Address nonexistant");

        // Delete from the mapping
        delete sharePairs[pairAddress];

        // 'Delete' from the array by setting the address to 0x0
        for (uint256 i = 0; i < sharePairsArray.length; i++) {
            if (sharePairsArray[i] == pairAddress) {
                sharePairsArray[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }
    }

    uint256[49] private __gap;
}
