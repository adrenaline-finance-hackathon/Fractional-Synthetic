// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../Interfaces/IDOPX.sol";

// MasterChef is the master of Dopple. He can make Dopple and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once DOPPLE is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is OwnableUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of Dopple
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accDopplePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accDopplePerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. Dopples to distribute per block.
        uint256 lastRewardBlock; // Last block number that Dopple distribution occurs.
        uint256 accDopplePerShare; // Accumulated Dopple per share, times 1e12. See below.
    }
    // The Dopple Exchange TOKEN!
    IDOPX public doppleX;
    // Dev address.
    address public devaddr;
    // Block number when bonus Dopple period ends.
    uint256 public bonusEndBlock;
    // Dopple tokens created per block.
    uint256 public doppleXPerBlock;
    // Bonus muliplier for early dopple makers.
    uint256 public constant BONUS_MULTIPLIER = 1;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;
    // The block number when Dopple mining starts.
    uint256 public startBlock;
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event SetDoppleXPerBlock(uint256 _newDoppleXPerBlock);

    function initialize(
        IDOPX _dopple,
        address _devaddr,
        uint256 _doppleXPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        address _newOwner
    ) public initializer {
        doppleX = _dopple;
        devaddr = _devaddr;
        doppleXPerBlock = _doppleXPerBlock;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
        totalAllocPoint = 0;
        __Ownable_init();
        transferOwnership(_newOwner);
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accDopplePerShare: 0
            })
        );
    }

    // Update the given pool's DOPPLE allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= bonusEndBlock) {
            // noted: BONUS_MULTIPLIER always 1, so the next block is do the same
            // if _from is before start block, user will receive reward too!
            // so _from should greater than start block!
            return _to.sub(_from).mul(BONUS_MULTIPLIER);
        } else if (_from >= bonusEndBlock) {
            return _to.sub(_from);
        } else {
            // noted: _from should greater than start block
            return
                bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(
                    _to.sub(bonusEndBlock)
                );
        }
    }

    // View function to see pending DOPPLE on frontend.
    function pendingDoppleX(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accDopplePerShare = pool.accDopplePerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(
                pool.lastRewardBlock,
                block.number
            );
            uint256 doppleReward = multiplier
                .mul(doppleXPerBlock)
                .mul(pool.allocPoint)
                .div(totalAllocPoint);
            accDopplePerShare = accDopplePerShare.add(
                doppleReward.mul(1e12).div(lpSupply)
            );
        }
        return
            user.amount.mul(accDopplePerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 doppleReward = multiplier
            .mul(doppleXPerBlock)
            .mul(pool.allocPoint)
            .div(totalAllocPoint);
        doppleX.mint(devaddr, doppleReward.div(10));
        doppleX.mint(address(this), doppleReward);
        pool.accDopplePerShare = pool.accDopplePerShare.add(
            doppleReward.mul(1e12).div(lpSupply)
        );
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for DOPPLE allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user
                .amount
                .mul(pool.accDopplePerShare)
                .div(1e12)
                .sub(user.rewardDebt);
            safeDoppleTransfer(msg.sender, pending);
        }
        pool.lpToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accDopplePerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accDopplePerShare).div(1e12).sub(
            user.rewardDebt
        );
        safeDoppleTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accDopplePerShare).div(1e12);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe dopple transfer function, just in case if rounding error causes pool to not have enough DOPPLEs.
    function safeDoppleTransfer(address _to, uint256 _amount) internal {
        uint256 doppleBal = doppleX.balanceOf(address(this));
        if (_amount > doppleBal) {
            doppleX.transfer(_to, doppleBal);
        } else {
            doppleX.transfer(_to, _amount);
        }
    }

    // Update dev address by the owner.
    function dev(address _devaddr) public onlyOwner {
        devaddr = _devaddr;
    }

    function setDoppleXPerBlock(uint256 _newDoppleXPerBlock)
        external
        onlyOwner
    {
        massUpdatePools();
        doppleXPerBlock = _newDoppleXPerBlock;
        emit SetDoppleXPerBlock(_newDoppleXPerBlock);
    }

    uint256[49] private __gap;
}
