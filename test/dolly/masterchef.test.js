const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

// UTILS
const {
  fastForwardBlock,
  fastForwardToBlock,
  toWei,
  fromWei,
} = require("../utils");

const MAX_UINT_256 = ethers.constants.MaxUint256;

describe("Dolly MasterChef hardhat_reset", function () {
  let doppleX;
  let masterChef;
  let lpToken1;
  let lpToken2;
  let lpToken3;
  let startBlock;
  let owner, user, devaddr, anotherDev, user2;
  beforeEach(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    [owner, user, devaddr, anotherDev, user2] = await ethers.getSigners();
    const DoppleX = await ethers.getContractFactory("DoppleX");

    await fastForwardBlock("1");
    doppleX = await upgrades.deployProxy(DoppleX, [owner.address], {
      kind: "transparent",
    });
    await doppleX.deployed();

    const MasterChef = await ethers.getContractFactory("MasterChef");

    const blockNumber = await ethers.provider.getBlockNumber();

    const _dopple = doppleX.address;
    _devaddr = devaddr.address;
    const _doppleXPerBlock = toWei("6");
    startBlock = blockNumber + 100;
    const _bonusEndBlock = blockNumber + 1000;
    const _newOwner = owner.address;

    masterChef = await upgrades.deployProxy(
      MasterChef,
      [
        _dopple,
        _devaddr,
        _doppleXPerBlock,
        startBlock,
        _bonusEndBlock,
        _newOwner,
      ],
      {
        kind: "transparent",
      }
    );
    await masterChef.deployed();

    await doppleX.grantRole(ethers.utils.id("MINTER"), owner.address);
    await doppleX.mint(owner.address, toWei("1000"));
    await doppleX.grantRole(ethers.utils.id("MINTER"), masterChef.address);

    const initialSupply = toWei("2000");
    const Mock = await ethers.getContractFactory("Mock");

    lpToken1 = await Mock.deploy(initialSupply);
    await lpToken1.deployed();
    await lpToken1.transfer(user.address, toWei("1000"));
    await lpToken1.transfer(user2.address, toWei("1000"));

    lpToken2 = await Mock.deploy(initialSupply);
    await lpToken2.deployed();
    await lpToken2.transfer(user.address, toWei("1000"));
    await lpToken2.transfer(user2.address, toWei("1000"));

    lpToken3 = await Mock.deploy(initialSupply);
    await lpToken3.deployed();
    await lpToken3.transfer(user.address, toWei("1000"));
    await lpToken3.transfer(user2.address, toWei("1000"));
  });

  it("Should deployed successfully", async function () {
    const doppleXPerBlock = await masterChef.doppleXPerBlock();
    expect(doppleXPerBlock).to.be.equal(toWei("6"));
  });

  it("Should get owner of MasterChef", async () => {
    const _owner = await masterChef.owner();
    expect(_owner).to.equals(owner.address);
  });

  it("Should add pool[0]", async function () {
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");
  });

  it("Should get poolLength", async function () {
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    // stake
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));
  });

  it("Should get pending reward of pool[0] before start block", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    const [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    const blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.lessThanOrEqual(startBlock);

    // stake
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(0);
  });

  it("Should get pending reward of pool[0] after start block", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));
  });

  it("Should claim reward of pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);

    expect(pendingReward).to.equals(toWei("576"));

    // claim reward
    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("582"));
  });

  it("Should throw error if unstake more than staked", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // claim reward
    const _overAmount = toWei("600");
    await expect(
      masterChef.connect(user).withdraw(_pid, _overAmount)
    ).to.be.revertedWith("withdraw: not good");
  });

  it("Should receive dev fee after unstake from pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);

    // claim reward
    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("582"));

    // expect dev address balance inceased
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(toWei("58.2")); // dev receive 10% of reward
  });

  it("Should set pool allocation of pool[0]", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(0);
  });

  it("Should stake to pool[0] after set pool allocation zero", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(0);

    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
  });

  it("Should get pending reward to zero of pool[0]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(0);
  });

  it("Should unstake from pool[0] without rewards", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(0);

    // expect reward = 0
    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    const sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    const devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
  });

  it("Should set dev address to another", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // set new dev address
    await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);
  });

  it("New dev address should receive dev fee", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // set new dev address
    await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);

    // claim reward
    let devBalance = await doppleX.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(0);

    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("588"));

    // expect dev address balance inceased
    devBalance = await doppleX.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(toWei("58.8")); // dev receive 10% of reward
  });

  it("Should add pool[0] pool[1] pool[2]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // claim reward
    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);

    await masterChef.connect(user).emergencyWithdraw(_pid); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    // expect dev address balance inceased
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0); // dev receive 10% of reward
  });

  it("should be able to stake two LPs by two users", async function () {
    let _allocPoint = 100;
    let _withUpdate = true;
    //add pool0
    let _lpToken1 = lpToken1.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken1, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken1);

    expect(await masterChef.totalAllocPoint()).to.equals("100");
    // add pool1
    let _lpToken2 = lpToken2.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken2, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken2);

    expect(await masterChef.totalAllocPoint()).to.equals("200");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at block 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));
    let lpBalance2 = await lpToken2.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);
    //user put stake on pool 0
    const _poolId0 = 0;
    const _amount0 = toWei("500");
    await masterChef.connect(user).deposit(_poolId0, _amount0);

    await lpToken2.connect(user2).approve(masterChef.address, MAX_UINT_256);
    //user2 put stake on pool 1
    const _poolId1 = 1;
    const _amount1 = toWei("500");
    await masterChef.connect(user2).deposit(_poolId1, _amount1);

    //user balance
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    //user2 balance
    lpBalance2 = await lpToken2.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("288"));

    // check pending reward
    const _pid1 = 1;
    const _user2 = user2.address;
    const pendingReward2 = await masterChef
      .connect(user2)
      .pendingDoppleX(_pid1, _user2);
    expect(pendingReward2).to.equals(toWei("288"));
    // claim reward
    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
    await masterChef.connect(user).withdraw(_pid, _amount0); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await masterChef.connect(user2).withdraw(_pid1, _amount1); // withdraw all of deposited
    lpBalance2 = await lpToken2.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("1000"));
    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("291")); //97*3

    let sdopBalance2 = await doppleX.balanceOf(user2.address);
    expect(sdopBalance2).to.equals(toWei("294")); //98*3

    // expect dev address balance increased
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(toWei("58.5")); // dev receive 10% of reward
  });

  it("should be able to stake two LPs by a user", async function () {
    let _allocPoint = 100;
    let _withUpdate = true;
    //add pool0
    let _lpToken1 = lpToken1.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken1, _withUpdate);

    let [address, allocation, lastRewardBlock] = await masterChef
      .connect(owner)
      .poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken1);

    expect(await masterChef.totalAllocPoint()).to.equals("100");
    // add pool1
    let _lpToken2 = lpToken2.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken2, _withUpdate);

    [address, allocation, lastRewardBlock1] = await masterChef
      .connect(owner)
      .poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken2);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at block 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));
    let lpBalance2 = await lpToken2.balanceOf(user.address);
    expect(lpBalance2).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);
    //user put stake on pool 0
    const _poolId0 = 0;
    const _amount0 = toWei("500");
    await masterChef.connect(user).deposit(_poolId0, _amount0);

    await lpToken2.connect(user).approve(masterChef.address, MAX_UINT_256);
    //user2 put stake on pool 1
    const _poolId1 = 1;
    const _amount1 = toWei("500");
    await masterChef.connect(user).deposit(_poolId1, _amount1);

    //user balance
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    //user2 balance
    lpBalance2 = await lpToken2.balanceOf(user.address);
    expect(lpBalance2).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("288"));

    // check pending reward
    const _pid1 = 1;
    const pendingReward2 = await masterChef
      .connect(user)
      .pendingDoppleX(_pid1, _user);
    expect(pendingReward2).to.equals(toWei("288"));
    // claim reward
    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
    await masterChef.connect(user).withdraw(_pid, _amount0); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await masterChef.connect(user).withdraw(_pid1, _amount1); // withdraw all of deposited
    lpBalance2 = await lpToken2.balanceOf(user.address);
    expect(lpBalance2).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("585")); //97*3 + 98*3

    // expect dev address balance increased
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(toWei("58.5")); // dev receive 10% of reward
  });

  it("should be able to stake one of the two LPs by two users", async function () {
    let _allocPoint = 100;
    let _withUpdate = true;
    //add pool0
    let _lpToken1 = lpToken1.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken1, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken1);

    expect(await masterChef.totalAllocPoint()).to.equals("100");
    // add pool1
    let _lpToken2 = lpToken2.address;
    await masterChef.connect(owner).add(_allocPoint, _lpToken2, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken2);

    expect(await masterChef.totalAllocPoint()).to.equals("200");

    // fast forward to block 100
    await fastForwardToBlock(100);
    let blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(100);

    // stake at block 100 (start reward block)
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));
    let lpBalance2 = await lpToken1.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);
    //user put stake on pool 0
    const _poolId0 = 0;
    const _amount0 = toWei("500");
    await masterChef.connect(user).deposit(_poolId0, _amount0);

    await lpToken1.connect(user2).approve(masterChef.address, MAX_UINT_256);
    //user2 put stake on pool 0
    const _amount1 = toWei("500");
    await masterChef.connect(user2).deposit(_poolId0, _amount1);

    //user balance
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    //user2 balance
    lpBalance2 = await lpToken1.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("144"));

    // check pending reward
    const _user2 = user2.address;
    const pendingReward2 = await masterChef
      .connect(user2)
      .pendingDoppleX(_pid, _user2);
    expect(pendingReward2).to.equals(toWei("144"));
    // claim reward
    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
    await masterChef.connect(user).withdraw(_pid, _amount0); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await masterChef.connect(user2).withdraw(_pid, _amount1); // withdraw all of deposited
    lpBalance2 = await lpToken1.balanceOf(user2.address);
    expect(lpBalance2).to.equals(toWei("1000"));
    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("145.5")); //97*1.5

    let sdopBalance2 = await doppleX.balanceOf(user2.address);
    expect(sdopBalance2).to.equals(toWei("148.5")); //97*1.5 + 1*3

    // expect dev address balance increased
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(toWei("29.4")); // dev receive 10% of reward
  });
  it("Should unstake from pool[0]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).set(_pid, _newAllocPoint, _withUpdate);

    [, allocation] = await masterChef.poolInfo(0);
    expect(allocation).to.equals(0);

    expect(await masterChef.totalAllocPoint()).to.equals(100);

    // start deposit
    let lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef.pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(0);

    // expect reward = 0
    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    const sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    const devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);
  });

  it("Should set dev address to another", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // set new dev address
    await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);
  });

  it("New dev address should receive dev fee", async function () {
    // add pool 0
    const _allocPoint = 100;
    const _lpToken = lpToken1.address;
    const _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // set new dev address
    await masterChef.connect(owner).dev(anotherDev.address);
    const newDev = await masterChef.devaddr();
    expect(newDev).to.to.equals(anotherDev.address);

    // claim reward
    let devBalance = await doppleX.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(0);

    await masterChef.connect(user).withdraw(_pid, _amount);
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(toWei("588"));

    // expect dev address balance inceased
    devBalance = await doppleX.balanceOf(anotherDev.address);
    expect(devBalance).to.equals(toWei("58.8")); // dev receive 10% of reward
  });

  it("Should add pool[0] pool[1] pool[2]", async function () {
    // add pool 0
    let _allocPoint = 100;
    let _lpToken = lpToken1.address;
    let _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("100");

    _allocPoint = 100;
    _lpToken = lpToken2.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

    [address, allocation] = await masterChef.connect(owner).poolInfo(1);
    expect(allocation).to.equals("100");
    expect(address).to.equals(_lpToken);

    expect(await masterChef.totalAllocPoint()).to.equals("200");
    _allocPoint = 100;
    _lpToken = lpToken3.address;
    _withUpdate = true;
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
    expect(lpBalance).to.equals(toWei("1000"));

    await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

    const _poolId = 0;
    const _amount = toWei("500");
    await masterChef.connect(user).deposit(_poolId, _amount);

    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("500"));

    // fast forward to block 200
    await fastForwardToBlock(200);
    blockNumber = await ethers.provider.getBlockNumber();
    expect(blockNumber).is.equals(200);

    // check pending reward
    const _pid = 0;
    const _user = user.address;
    const pendingReward = await masterChef
      .connect(user)
      .pendingDoppleX(_pid, _user);
    expect(pendingReward).to.equals(toWei("576"));

    // claim reward
    let devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0);

    await masterChef.connect(user).emergencyWithdraw(_pid); // withdraw all of deposited
    lpBalance = await lpToken1.balanceOf(user.address);
    expect(lpBalance).to.equals(toWei("1000"));

    let sdopBalance = await doppleX.balanceOf(user.address);
    expect(sdopBalance).to.equals(0);

    // expect dev balance is zero
    devBalance = await doppleX.balanceOf(devaddr.address);
    expect(devBalance).to.equals(0); // dev receive 10% of reward (0)
  });

  describe("# SET Dopple X Per Block", () => {
    it("should be able to set doppleXPerBlock", async () => {
      [owner] = await ethers.getSigners();

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("3"));

      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("3"));
    });

    it("should be reverted with someone submit to set doppleXPerBlock", async () => {
      [, someone] = await ethers.getSigners();

      await expect(masterChef.connect(someone).setDoppleXPerBlock(toWei("3")))
        .to.be.reverted;

      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("6"));
    });

    it("should be able to set doppleXPerBlock to 3 and then try to farm", async () => {
      [owner] = await ethers.getSigners();

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("3"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("3"));

      // ** try to stake **

      // add pool 0
      const _allocPoint = 100;
      const _lpToken = lpToken1.address;
      const _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
      expect(lpBalance).to.equals(toWei("1000"));

      await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

      const _poolId = 0;
      const _amount = toWei("500");
      await masterChef.connect(user).deposit(_poolId, _amount);

      lpBalance = await lpToken1.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("500"));

      // fast forward to block 200
      await fastForwardToBlock(200);
      blockNumber = await ethers.provider.getBlockNumber();
      expect(blockNumber).is.equals(200);

      // check pending reward
      const _pid = 0;
      const _user = user.address;
      const pendingReward = await masterChef
        .connect(user)
        .pendingDoppleX(_pid, _user);
      expect(pendingReward).to.equals(toWei("288"));
    });

    it("should be able to set doppleXPerBlock to 6 and then try to farm", async () => {
      [owner] = await ethers.getSigners();

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("6"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("6"));

      // ** try to stake **

      // add pool 0
      const _allocPoint = 100;
      const _lpToken = lpToken1.address;
      const _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
      expect(lpBalance).to.equals(toWei("1000"));

      await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

      const _poolId = 0;
      const _amount = toWei("500");
      await masterChef.connect(user).deposit(_poolId, _amount);

      lpBalance = await lpToken1.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("500"));

      // fast forward to block 200
      await fastForwardToBlock(200);
      blockNumber = await ethers.provider.getBlockNumber();
      expect(blockNumber).is.equals(200);

      // check pending reward
      const _pid = 0;
      const _user = user.address;
      const pendingReward = await masterChef
        .connect(user)
        .pendingDoppleX(_pid, _user);
      expect(pendingReward).to.equals(toWei("576"));
    });

    it("should be able to set doppleXPerBlock to 1 while block has started", async () => {
      [owner] = await ethers.getSigners();

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("6"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("6"));

      // ** try to stake **

      // add pool 0
      const _allocPoint = 100;
      const _lpToken = lpToken1.address;
      const _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

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
      expect(lpBalance).to.equals(toWei("1000"));

      await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

      const _poolId = 0;
      const _amount = toWei("500");
      await masterChef.connect(user).deposit(_poolId, _amount);

      lpBalance = await lpToken1.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("500"));

      // fast forward to block 200
      await fastForwardToBlock(200);
      blockNumber = await ethers.provider.getBlockNumber();
      expect(blockNumber).is.equals(200);

      // check pending reward
      const _pid = 0;
      const _user = user.address;
      const pendingReward = await masterChef
        .connect(user)
        .pendingDoppleX(_pid, _user);
      expect(pendingReward).to.equals(toWei("576"));

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("1"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("1"));

      await fastForwardBlock(10);

      expect(
        await masterChef.connect(user).pendingDoppleX(_pid, _user)
      ).to.equals(toWei("592"));

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("3.5"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("3.5"));

      await fastForwardBlock(2);

      expect(
        await masterChef.connect(user).pendingDoppleX(_pid, _user)
      ).to.equals(toWei("600"));
    });

    it("should add pool same lp address and no problems", async () => {
      [owner] = await ethers.getSigners();

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("6"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("6"));

      // ** try to stake **

      // add pool 0
      let _allocPoint = 100;
      let _lpToken = lpToken1.address;
      let _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

      let [address, allocation] = await masterChef.connect(owner).poolInfo(0);
      expect(allocation).to.equals("100");
      expect(address).to.equals(_lpToken);

      expect(await masterChef.totalAllocPoint()).to.equals("100");

      // fast forward to block 100
      await fastForwardToBlock(100);
      let blockNumber = await ethers.provider.getBlockNumber();
      expect(blockNumber).is.equals(100);

      // stake at bloct 100 (start reward block)
      let lpBalance = await lpToken1.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("1000"));

      await lpToken1.connect(user).approve(masterChef.address, MAX_UINT_256);

      let _poolId = 0;
      let _amount = toWei("500");
      await masterChef.connect(user).deposit(_poolId, _amount);

      lpBalance = await lpToken1.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("500"));

      // fast forward to block 200
      await fastForwardToBlock(200);
      blockNumber = await ethers.provider.getBlockNumber();
      expect(blockNumber).is.equals(200);

      // check pending reward
      const _pid = 0;
      const _user = user.address;
      const pendingReward = await masterChef
        .connect(user)
        .pendingDoppleX(_pid, _user);
      expect(pendingReward).to.equals(toWei("576"));

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("1"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("1"));

      await fastForwardBlock(10);

      expect(
        await masterChef.connect(user).pendingDoppleX(_pid, _user)
      ).to.equals(toWei("592"));

      await masterChef.connect(owner).setDoppleXPerBlock(toWei("3.5"));
      expect(await masterChef.doppleXPerBlock()).to.equals(toWei("3.5"));

      await fastForwardBlock(2);

      expect(
        await masterChef.connect(user).pendingDoppleX(_pid, _user)
      ).to.equals(toWei("600"));

      // new code
      _allocPoint = 0;
      _lpToken = lpToken2.address;
      _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

      [address, allocation] = await masterChef.connect(owner).poolInfo(1);
      // expect(allocation).to.equals("100");
      expect(address).to.equals(_lpToken);

      // expect(await masterChef.totalAllocPoint()).to.equals("200");
      _allocPoint = 0;
      _lpToken = lpToken2.address; // ! Same LP as pool 1
      _withUpdate = true;
      await masterChef.connect(owner).add(_allocPoint, _lpToken, _withUpdate);

      [address, allocation] = await masterChef.connect(owner).poolInfo(2);
      // expect(allocation).to.equals("100");
      expect(address).to.equals(_lpToken);

      // expect(await masterChef.totalAllocPoint()).to.equals("300");

      lpBalance = await lpToken2.balanceOf(user.address);
      expect(lpBalance).to.equals(toWei("1000"));

      await lpToken2.connect(user).approve(masterChef.address, MAX_UINT_256);

      // ! add same pool with no allocation point
      _poolId = 1;
      _amount = toWei("500");
      let pendingDoppleX;
      await masterChef.connect(user).deposit(_poolId, _amount);
      await fastForwardBlock(100);
      pendingDoppleX = await masterChef.connect(user).pendingDoppleX(1, _user);
      expect(pendingDoppleX).to.eq(0);

      _poolId = 2;
      _amount = toWei("500");
      await masterChef.connect(user).deposit(_poolId, _amount);
      await fastForwardBlock(100);
      pendingDoppleX = await masterChef.connect(user).pendingDoppleX(2, _user);
      expect(pendingDoppleX).to.eq(0);

      _poolId = 2;
      _allocPoint = 100;
      await masterChef.connect(owner).set(_poolId, _allocPoint, _withUpdate);

      // ! pool 1 with no allocation point have no pending reward
      await fastForwardBlock(100);
      pendingDoppleX = await masterChef.connect(user).pendingDoppleX(1, _user);
      expect(pendingDoppleX).to.eq(0);

      // ! pool 2 with allocation point have pending reward
      pendingDoppleX = await masterChef.connect(user).pendingDoppleX(2, _user);
      expect(pendingDoppleX).to.eq(toWei("87.5"));

      // ! can withdraw pool 1 with no allocation point
      let beforeBalance = await doppleX.balanceOf(user.address);
      await masterChef.connect(user).withdraw(1, pendingDoppleX);
      let afterBalance = await doppleX.balanceOf(user.address);
      expect(beforeBalance).to.eq(afterBalance);

      // ! can withdraw pool 2 with allocation point
      beforeBalance = await doppleX.balanceOf(user.address);
      await masterChef.connect(user).withdraw(2, pendingDoppleX);
      afterBalance = await doppleX.balanceOf(user.address);
      expect(afterBalance).is.closeTo(toWei("97"), toWei("98"));

      // ! can get pending reward from pool 0 (old pool)
      pendingDoppleX = await masterChef.connect(user).pendingDoppleX(0, _user);
      expect(pendingDoppleX).to.eq(toWei("1499.5"));

      // ! can withdraw pool 0 with allocation point
      beforeBalance = await doppleX.balanceOf(user.address);
      await masterChef.connect(user).withdraw(0, toWei("500"));
      afterBalance = await doppleX.balanceOf(user.address);
      expect(afterBalance).is.closeTo(
        beforeBalance.add(pendingDoppleX).sub(toWei("1")),
        beforeBalance.add(pendingDoppleX).add(toWei("1"))
      );
    });
  });
});
