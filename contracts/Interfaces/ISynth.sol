// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISynth is IERC20 {
    function mint(address to, uint256 _amount) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function getSynthPrice() external view returns (uint256);
}
