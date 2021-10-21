const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");
const MAX_UINT_256 = ethers.constants.MaxUint256;

// UTILS
const { fastForwardBlock, fastForwardToBlock } = require("../utils");

describe("TWX MasterChef hardhat_reset", function () {
  let _twx;
  let twx;
  let _masterChef;
  let masterChef;
  let lpToken1;
  let lpToken2;
  let lpToken3;
  let startBlock;
  let owner, minter, user, devaddr, anotherDev;
  let tx;
  beforeEach(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    [owner, minter, user, devaddr, anotherDev] = await ethers.getSigners();
    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();

    const MasterChef = await ethers.getContractFactory("TWXMasterChef");

    const blockNumber = await ethers.provider.getBlockNumber();

    _devaddr = devaddr.address;
    const _twxPerBlock = ethers.utils.parseEther("6");
    startBlock = blockNumber + 100;
    const _bonusEndBlock = blockNumber + 1000;
    const _newOwner = owner.address;

    masterChef = await upgrades.deployProxy(
      MasterChef,
      [
        twx.address,
        _devaddr,
        _twxPerBlock,
        startBlock,
        _bonusEndBlock,
        _newOwner,
      ],
      {
        kind: "transparent",
      }
    );
    await masterChef.deployed();

    await twx.grantRole(ethers.utils.id("MINTER"), minter.address);
    await twx
      .connect(minter)
      .mint(owner.address, ethers.utils.parseEther("1000"));

    await expect(twx.grantRole(ethers.utils.id("MINTER"), masterChef.address))
      .to.not.reverted;

    const MINTER_ROLE = ethers.utils.id("MINTER");

    const isMasterChefMinter = await twx.hasRole(
      MINTER_ROLE,
      masterChef.address
    );
    expect(isMasterChefMinter).to.be.true;

    const initialSupply = ethers.utils.parseEther("1000");
    const Mock = await ethers.getContractFactory("Mock");

    lpToken1 = await Mock.deploy(initialSupply);
    await lpToken1.deployed();
    await lpToken1.transfer(user.address, initialSupply);

    lpToken2 = await Mock.deploy(initialSupply);
    await lpToken2.deployed();
    await lpToken2.transfer(user.address, initialSupply);

    lpToken3 = await Mock.deploy(initialSupply);
    await lpToken3.deployed();
    await lpToken3.transfer(user.address, initialSupply);
  });

  it("Should deployed successfully", async function () {
    const twxPerBlock = await masterChef.twxPerBlock();
    expect(twxPerBlock).to.be.equal(ethers.utils.parseEther("6"));
  });

  it("Should get owner of MasterChef", async () => {
    const _owner = await masterChef.owner();
    expect(_owner).to.equals(owner.address);
  });

  it("Should add pool[0]", async function () {
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");
  });

  it("Should get poolLength", async function () {
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    expect(await masterChef.poolLength()).to.equals(1);
  });

  it("Should stake to pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // stake
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));
  });

  it("Should get pending reward of pool[0] before start block", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    const blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.lessThanOrEqual(startBlock);

    // stake
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(0);
  });

  it("Should get pending reward of pool[0] before after block", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));
  });

  it("Should claim reward of pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    // claim reward
    tx = await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    let sdopBalance = await twx.balanceOf(user.address);
    expect(sdopBalance).to.equals(ethers.utils.parseEther("582"));
  });

  it("Should throw error if unstake more than staked", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    // claim reward
    const _overAmount = ethers.utils.parseEther("600");
    await expect(
      masterChef.connect(user).withdraw(_pid, _overAmount)
    ).to.be.revertedWith("withdraw: not good");
  });

  it("Should receive dev fee after unstake from pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    let devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);

    // claim reward
    tx = await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    let sdopBalance = await twx.balanceOf(user.address);
    expect(sdopBalance).to.equals(ethers.utils.parseEther("582"));

    // expect dev address balance inceased
    devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(ethers.utils.parseEther("58.2")); // dev receive 10% of reward
  });

  it("Should set pool allocation of pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // set pool allocation
    const _pid = 0;
    const _newAllocPoint = 0;
    tx = await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(0);
  });

  it("Should stake to pool[0] after set pool allocation zero", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // BIG NOTE: some of all pools allocation point must not equal to zero (divided by zero)
    // then we need to add another pool
    // add pool 1
    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // set pool allocation
    let _pid = 0;
    const _newAllocPoint = 0;
    tx = await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(0);

    let devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
  });

  it("Should get pending reward to zero of pool[0]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // BIG NOTE: some of all pools allocation point must not equal to zero (divided by zero)
    // then we need to add another pool
    // add pool 1
    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // set pool allocation
    let _pid = 0;
    const _newAllocPoint = 0;
    tx = await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(0);
  });

  it("Should unstake from pool[0]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // BIG NOTE: some of all pools allocation point must not equal to zero (divided by zero)
    // then we need to add another pool
    // add pool 1
    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // set pool allocation
    let _pid = 0;
    const _newAllocPoint = 0;
    tx = await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(0);

    // expect reward = 0
    tx = await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    const sdopBalance = await twx.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    const devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
  });

  it("Should set dev address to another", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    // set new dev address
    tx = await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);
  });

  it("New dev address should receive dev fee", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    // set new dev address
    tx = await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);

    // claim reward
    let devBalance = await twx.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(0);

    tx = await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    let sdopBalance = await twx.balanceOf(user.address);
    expect(sdopBalance).to.equals(ethers.utils.parseEther("588"));

    // expect dev address balance inceased
    devBalance = await twx.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(ethers.utils.parseEther("58.8")); // dev receive 10% of reward
  });

  it("Should add pool[0] pool[1] pool[2]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(2);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("300");
  });

  it("Should get poolLength", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(2);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("300");

    // get pool length
    const poolLength = await masterChef.poolLength();
    expect(poolLength).to.equals(3);
  });

  it("Allocation point of each pool is correct and total allocation is correct", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(2);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("300");
  });

  it("Should emergencyWithdraw", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    tx = await masterChef
      .connect(owner)
      .add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at bloct 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = ethers.utils.parseEther("500");
    tx = await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingTWX(_pid, _user);
    expect(pendingReward).to.equals(ethers.utils.parseEther("576"));

    // claim reward
    let devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);

    tx = await masterChef.connect(user).emergencyWithdraw(_pid); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(ethers.utils.parseEther("1000"));

    let sdopBalance = await twx.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    // expect dev balance is zero
    devBalance = await twx.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0); // dev receive 10% of reward (0)
  });
});
