const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const HALF = ethers.utils.parseEther("0.5");
const ONE = ethers.utils.parseEther("1");
const GR_TOP_BAND = 1e15;
const GR_BOTTOM_BAND = 1e15;
const internalCooldown = 60; //seconds
const addressZero = ethers.constants.AddressZero;
const {
  startAutoMine,
  stopAutoMine,
  toWei,
  fromWei,
  impersonateAccount,
  mineBlock,
  currentTime,
  fastForwardTimestamp,
} = require("../utils");

describe("PID controller", async () => {
  let pidController,
    reserveTracker,
    synthOracle,
    synth,
    pairShareUsdc,
    pairShareBusd,
    usdc,
    busd,
    share,
    owner,
    user1,
    feeCollector;

  before(async () => {
    [owner, minter, user1, burnPool, feeCollector] = await ethers.getSigners();
    // const Share = await ethers.getContract("Share");
    // const ReserveTracker = await ethers.getContract("ReserverTracker");
    // const Synth = await ethers.getContract("Synth");
    // Share
    const Share = await ethers.getContractFactory("TWX");
    let _share = await Share.deploy();
    await _share.deployed();

    share = await upgrades.deployProxy(Share, [owner.address], {
      kind: "transparent",
    });
    await share.deployed();
    // Mock USDC
    const MockUsdc = await ethers.getContractFactory("MockWithName");
    usdc = await MockUsdc.deploy(ONE, "USDC", "USDC");
    await usdc.deployed();
    // Mock BUSD
    const MockBusd = await ethers.getContractFactory("MockWithName");
    busd = await MockBusd.deploy(ONE, "BUSD", "BUSD");
    await busd.deployed();

    // Mock Share-USDC
    const MockShareUsdcPair = await ethers.getContractFactory("MockPair");
    pairShareUsdc = await MockShareUsdcPair.deploy(
      share.address,
      usdc.address,
      ONE,
      HALF
    );
    const MockShareBusdPair = await ethers.getContractFactory("MockPair");
    pairShareBusd = await MockShareBusdPair.deploy(
      busd.address,
      share.address,
      HALF,
      ONE
    );
    await pairShareUsdc.deployed();
    await pairShareBusd.deployed();

    // Reserver Tracker
    const RT = await ethers.getContractFactory("ReserveTracker");
    let _rt = await RT.deploy();
    await _rt.deployed();

    reserveTracker = await upgrades.deployProxy(RT, [share.address]);
    await reserveTracker.deployed();

    await reserveTracker.connect(owner).addSharePair(pairShareUsdc.address);
    await reserveTracker.connect(owner).addSharePair(pairShareBusd.address);
  });

  beforeEach(async () => {
    const CollateralReserve = await ethers.getContractFactory(
      "CollateralReserve"
    );
    let _collateralReserve = await CollateralReserve.deploy();
    await _collateralReserve.deployed();

    collateralReserve = await upgrades.deployProxy(CollateralReserve, [], {
      kind: "transparent",
      initializer: false,
    });

    const Synth = await ethers.getContractFactory("Synth");
    let _synth = await Synth.deploy();
    await _synth.deployed();

    synth = await upgrades.deployProxy(
      Synth,
      [owner.address, "KELLY", "KUSD"],
      {
        kind: "transparent",
      }
    );

    await synth.deployed();

    // ** Mock synth oracle **
    const MockPairOracle = await ethers.getContractFactory("MockPairOracle");
    synthOracle = await MockPairOracle.deploy(toWei("200"));
    await synthOracle.deployed();

    // set Synth oracle
    await synth.connect(owner).setOracle(synthOracle.address);

    const _minterRole = await synth.MINTER_ROLE();
    await synth.connect(owner).grantRole(_minterRole, minter.address);
    await synth
      .connect(minter)
      .mint(user1.address, ethers.utils.parseEther("500"));

    // PIDController
    const PIDController = await ethers.getContractFactory("PIDController");
    let _pidController = await PIDController.deploy();
    await _pidController.deployed();
    pidController = await upgrades.deployProxy(
      PIDController,
      [
        collateralReserve.address,
        share.address,
        reserveTracker.address,
        synthOracle.address,
      ],
      {
        kind: "transparent",
      }
    );
    await pidController.deployed();

    await collateralReserve.initialize(
      owner.address,
      pidController.address,
      share.address,
      synthOracle.address,
      feeCollector.address
    );

    await collateralReserve.addSynth(synth.address);
  });

  it("Deployment should assign...", async function () {
    expect(await pidController.GR_TOP_BAND()).to.equal(GR_TOP_BAND);
    expect(await pidController.GR_BOTTOM_BAND()).to.equal(GR_BOTTOM_BAND);
    expect(await pidController.growthRatio()).to.equal(0);
    expect(await pidController.isActive()).to.equal(false);
    expect(await pidController.priceFeedAddress()).to.equal(
      synthOracle.address
    );
    expect(await pidController.reserveTrackerAddress()).to.equal(
      reserveTracker.address
    );
    expect(await pidController.lastUpdate()).to.equal(0);
    expect(await pidController.internalCooldown()).to.equal(0);
  });

  it("should NOT be able to refresh CR if PID controller is NOT active", async function () {
    expect(await pidController.isActive()).to.eq(false);
    await expect(
      pidController.connect(owner).refreshCollateralRatio()
    ).to.be.revertedWith("unactive");
  });

  it("owner is able to activate PID controller", async function () {
    expect(await pidController.isActive()).to.eq(false);
    await pidController.connect(owner).activate(true);
    expect(await pidController.isActive()).to.eq(true);
  });

  it("owner is able to set reserve tracker", async function () {
    await expect(pidController.setReserveTracker(reserveTracker.address)).to.not
      .reverted;
  });

  it("owner is able to set growth ratio bands", async function () {
    const new_GR_BAND = BigNumber.from(1e10);
    await pidController
      .connect(owner)
      .setGrowthRatioBands(new_GR_BAND, new_GR_BAND);
    expect(await pidController.GR_TOP_BAND()).to.eq(1e10);
    expect(await pidController.GR_BOTTOM_BAND()).to.eq(1e10);
  });

  it("owner is able to set internal cooldown", async function () {
    await pidController.connect(owner).setInternalCooldown(internalCooldown);
    expect(await pidController.internalCooldown()).to.eq(internalCooldown);
  });

  it("should NOT be able to refresh CR within cool down period", async function () {
    // let it passes the first time to set lastUpdate
    const _currentTime = await currentTime();
    const _plus60secs = new Date(_currentTime * 1000).setSeconds(
      new Date(_currentTime * 1000).getSeconds() + 60
    );
    await pidController.connect(owner).activate(true);
    expect(await pidController.isActive()).to.eq(true);
    await pidController.connect(owner).setInternalCooldown(internalCooldown);
    const _internalCooldown = await pidController.internalCooldown();
    expect(_internalCooldown).to.eq(internalCooldown);

    await fastForwardTimestamp(60);
    const _newCurrentTime = await currentTime();
    expect(_newCurrentTime).to.gte(_plus60secs / 1000);

    await pidController.refreshCollateralRatio();
    const _anotherCurrentTime = await currentTime();
    expect(await pidController.lastUpdate()).to.eq(_anotherCurrentTime);
    const sharePrice = await synthOracle.consult(share.address, ONE);
    const shareReserves = await reserveTracker.getShareReserves();
    const shareLiquidity = BigNumber.from(shareReserves).mul(
      BigNumber.from(sharePrice)
    );
    const synthTotalSupply = await synth.totalSupply();
    const newGrowthRatio = BigNumber.from(shareLiquidity).div(
      BigNumber.from(synthTotalSupply)
        .mul((await synth.getSynthPrice()).toString())
        .div(ONE)
    );
    const growthRatio = await pidController.growthRatio();
    const lastUpdate = await pidController.lastUpdate();
    expect(growthRatio.toString()).to.eq(newGrowthRatio);
    expect(lastUpdate).to.gt(_currentTime);

    // fastForwardTimestamp less than internalCooldown
    expect(await pidController.lastUpdate()).to.not.eq(0);
    expect(await pidController.lastUpdate()).to.eq(lastUpdate);
    expect(await pidController.isActive()).to.eq(true);

    await fastForwardTimestamp(50);

    await expect(pidController.refreshCollateralRatio()).to.be.revertedWith(
      "internal cooldown not passed"
    );
    expect(await pidController.lastUpdate()).to.eq(lastUpdate);
    expect(await pidController.growthRatio()).to.eq(newGrowthRatio);
  });

  it("should be able to refresh CR within cool down period and is activated", async function () {
    const _currentTime = await currentTime();
    const _plus60secs = new Date(_currentTime * 1000).setSeconds(
      new Date(_currentTime * 1000).getSeconds() + 60
    );
    await pidController.connect(owner).activate(true);
    expect(await pidController.isActive()).to.eq(true);
    await pidController.connect(owner).setInternalCooldown(internalCooldown);
    const _internalCooldown = await pidController.internalCooldown();
    expect(_internalCooldown).to.eq(internalCooldown);

    await fastForwardTimestamp(60);
    const _newCurrentTime = await currentTime();
    expect(_newCurrentTime).to.gte(_plus60secs / 1000);

    await pidController.refreshCollateralRatio();
    const _anotherCurrentTime = await currentTime();
    expect(await pidController.lastUpdate()).to.eq(_anotherCurrentTime);
    const sharePrice = await synthOracle.consult(share.address, ONE);
    const shareReserves = await reserveTracker.getShareReserves();
    const shareLiquidity = BigNumber.from(shareReserves).mul(
      BigNumber.from(sharePrice)
    );

    const synthTotalSupply = await synth.totalSupply();
    const newGrowthRatio = BigNumber.from(shareLiquidity).div(
      BigNumber.from(synthTotalSupply)
        .mul((await synth.getSynthPrice()).toString())
        .div(ONE)
    );
    const growthRatio = await pidController.growthRatio();
    const lastUpdate = await pidController.lastUpdate();
    expect(growthRatio.toString()).to.eq(newGrowthRatio);
    expect(lastUpdate).to.gt(_currentTime);
  });

  it("should be able to set Synth", async function () {
    await expect(pidController.connect(owner).setCollateralReserve(addressZero))
      .to.not.reverted;
  });

  it("should be able to set Share contract address", async function () {
    await expect(
      pidController.connect(owner).setShareContractAddress(addressZero)
    ).to.not.reverted;
  });

  it("should be able to set price feed contract address", async function () {
    await expect(
      pidController.connect(owner).setPriceFeedAddress(synthOracle.address)
    ).to.not.reverted;
  });

  it("should be able to set new GR ", async function () {
    await expect(pidController.connect(owner).setGrowthRatioBands(1e12, 1e12))
      .not.to.reverted;
    expect(await pidController.GR_TOP_BAND()).to.eq(1e12);
    expect(await pidController.GR_BOTTOM_BAND()).to.eq(1e12);
  });

  it("owner is able to DE-activate PID controller", async function () {
    await expect(pidController.connect(owner).activate(false)).to.not.reverted;
    expect(await pidController.isActive()).to.eq(false);
  });

  it("non owner is NOT able to active PID controller", async function () {
    await expect(pidController.connect(user1).activate(true)).to.be.reverted;
    expect(await pidController.isActive()).to.eq(false);
  });

  it("non owner is NOT able to DE-active PID controller", async function () {
    await expect(pidController.connect(user1).activate(false)).to.be.reverted;
    expect(await pidController.isActive()).to.eq(false);
  });

  it("non owner is NOT able to set reserve tracker", async function () {
    await expect(pidController.connect(user1).setReserveTracker(addressZero)).to
      .be.reverted;
    expect(await pidController.reserveTrackerAddress()).to.eq(
      reserveTracker.address
    );
  });

  it("non owner is NOT able to set growth ratio bands", async function () {
    await expect(pidController.connect(user1).setGrowthRatioBands(1e16, 1e16))
      .to.be.reverted;
    expect(await pidController.GR_TOP_BAND()).to.eq(GR_TOP_BAND);
    expect(await pidController.GR_BOTTOM_BAND()).to.eq(GR_BOTTOM_BAND);
  });

  it("non owner is NOT able to set internal cooldown", async function () {
    await expect(
      pidController.connect(user1).setInternalCooldown(internalCooldown - 10)
    ).to.be.reverted;
    expect(await pidController.internalCooldown()).to.eq(0);
  });

  it("non owner should NOT be able to set Synth", async function () {
    await expect(pidController.connect(user1).setCollateralReserve(addressZero))
      .to.be.reverted;
  });

  it("non owner should NOT be able to set Share contract address", async function () {
    await expect(
      pidController.connect(user1).setShareContractAddress(addressZero)
    ).to.be.reverted;
  });

  it("non owner should NOT be able to set price feed contract address", async function () {
    await expect(pidController.connect(user1).setPriceFeedAddress(addressZero))
      .to.be.reverted;
  });
});
