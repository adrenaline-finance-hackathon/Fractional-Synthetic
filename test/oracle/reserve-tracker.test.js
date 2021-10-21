const { expect } = require("chai");
const { ethers } = require("hardhat");
const ONE = ethers.utils.parseEther("1");
const TWO = ethers.utils.parseEther("2");

describe("Reserve Tracker", async () => {
  let usdc, busd, reserveTracker, pairShareUsdc, pairShareBusd, owner, user1;
  before(async () => {
    [owner, user1] = await ethers.getSigners();
    const Share = await ethers.getContractFactory("TWX");
    _share = await Share.deploy();
    await _share.deployed();

    share = await upgrades.deployProxy(Share, [owner.address], {
      kind: "transparent",
    });
    await share.deployed();

    const MockUsdc = await ethers.getContractFactory("MockWithName");
    usdc = await MockUsdc.deploy(ONE, "USDC", "USDC");
    await usdc.deployed();

    const MockBusd = await ethers.getContractFactory("MockWithName");
    busd = await MockBusd.deploy(ONE, "BUSD", "BUSD");
    await busd.deployed();

    const MockShareUsdcPair = await ethers.getContractFactory("MockPair");
    pairShareUsdc = await MockShareUsdcPair.deploy(
      share.address,
      usdc.address,
      ONE,
      ethers.utils.parseEther("0.5")
    );

    const MockShareBusdPair = await ethers.getContractFactory("MockPair");
    pairShareBusd = await MockShareBusdPair.deploy(
      busd.address,
      share.address,
      ethers.utils.parseEther("0.5"),
      ONE
    );

    const RT = await ethers.getContractFactory("ReserveTracker");
    let _rt = await RT.deploy();
    await _rt.deployed();

    reserveTracker = await upgrades.deployProxy(RT, [share.address]);
    await reserveTracker.deployed();
  });

  it("Deploy with initial states", async function () {
    expect(await reserveTracker.getShareReserves()).to.equal(0);
  });

  it("non owner should NOT be able to add Share pair", async function () {
    await expect(
      reserveTracker.connect(user1).addSharePair(pairShareUsdc.address)
    ).to.be.revertedWith("Caller is not a maintainer");
  });

  it("non owner should NOT be able to remove Share pair", async function () {
    await expect(
      reserveTracker.connect(user1).removeSharePair(pairShareUsdc.address)
    ).to.be.revertedWith("Caller is not a maintainer");
  });

  it("should return zero Share reserves", async function () {
    expect(await reserveTracker.getShareReserves()).to.equal(0);
  });

  it("should be able to add new Share pair", async function () {
    // pairShareUsdc
    await reserveTracker.connect(owner).addSharePair(pairShareUsdc.address);
    expect(await reserveTracker.sharePairsArray(0)).to.equal(
      pairShareUsdc.address
    );
    expect(await reserveTracker.sharePairs(pairShareUsdc.address)).to.equal(
      true
    );
    expect(await reserveTracker.getShareReserves()).to.equal(ONE);
    // pairShareBusd
    await reserveTracker.connect(owner).addSharePair(pairShareBusd.address);
    expect(await reserveTracker.sharePairsArray(0)).to.equal(
      pairShareUsdc.address
    );
    expect(await reserveTracker.sharePairsArray(1)).to.equal(
      pairShareBusd.address
    );
    expect(await reserveTracker.sharePairs(pairShareUsdc.address)).to.equal(
      true
    );
    expect(await reserveTracker.sharePairs(pairShareBusd.address)).to.equal(
      true
    );
    expect(await reserveTracker.getShareReserves()).to.equal(TWO);
  });

  it("should return Share reserves", async function () {
    expect(await reserveTracker.getShareReserves()).to.equal(TWO);
  });

  it("should be able to remove Share pair", async function () {
    //pairShareBusd
    await reserveTracker.connect(owner).removeSharePair(pairShareBusd.address);
    expect(await reserveTracker.sharePairs(pairShareBusd.address)).to.equal(
      false
    );
    expect(await reserveTracker.sharePairsArray(1)).to.equal(
      ethers.constants.AddressZero
    );
  });

  it("should decrease Share reserves once removed", async function () {
    expect(await reserveTracker.getShareReserves()).to.equal(ONE);
  });
});
