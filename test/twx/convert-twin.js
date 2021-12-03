const { expect } = require("chai");
const {
  ethers: {
    utils: { parseEther, formatEther },
    constants: { MaxUint256 },
  },
} = require("hardhat");
const { BigNumber } = require("ethers");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");
const burnPool = "0x0000000000000000000000000000000000000000";
const MAX_INT =
  "57896044618658097711785492504343953926634992332820282019728792003956564819967";

// UTILS
const fastForwardBlock = (number) => {
  const promises = [];
  for (let i = 0; i <= number; i++) {
    promises.push(ethers.provider.send("evm_mine"));
  }
  return Promise.all(promises);
};

describe("Convert TWIN", function () {
  let twin;
  let convertTwin;
  let twx;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });
    const MINTER = ethers.utils.id("MINTER");
    const [owner, minter, user, burnPool] = await ethers.getSigners();

    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();

    const Mock = await ethers.getContractFactory("Mock");
    twin = await Mock.deploy(ONE);
    await twin.deployed();

    const ConvertTwin = await ethers.getContractFactory("ConvertTwin");
    convertTwin = await ConvertTwin.deploy(
      twin.address,
      twx.address,
      burnPool.address
    );
    await convertTwin.deployed();

    await twx.connect(owner).grantRole(MINTER, minter.address);
    await twx.connect(minter).mint(convertTwin.address, ONE);
    await twin.mint(user.address, ONE);
    await twx.setTransferLimit(MaxUint256);
  });

  it("must have correct balance before test", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    //Convert Balance
    const convertBalance = await twx.balanceOf(convertTwin.address);
    expect(convertBalance).to.be.equal(ONE);

    //User Balance
    const userTwinBalance = await twin.balanceOf(user.address);
    expect(userTwinBalance).to.be.equal(ONE);
  });

  it("shall convert twin to twx", async function () {
    const [owner, minter, user, burnPool] = await ethers.getSigners();

    await twin.connect(user).approve(convertTwin.address, ONE);

    const allowance = await twin.allowance(user.address, convertTwin.address);
    expect(allowance).to.be.equal(ONE);
    const userTwinBalance = await twin.balanceOf(user.address);
    expect(userTwinBalance).to.be.equal(ONE);

    await convertTwin.connect(user).convert(ONE);

    const userTWXBalance = await twx.balanceOf(user.address);
    const afterUserTwinBalance = await twin.balanceOf(user.address);
    const convertTWXBalance = await twx.balanceOf(convertTwin.address);

    const burnPoolTwinBalance = await twin.balanceOf(burnPool.address);
    expect(userTWXBalance).to.be.equal(ONE);
    expect(afterUserTwinBalance).to.be.equal(ZERO);
    expect(convertTWXBalance).to.be.equal(ZERO);
    expect(burnPoolTwinBalance).to.be.equal(ONE);
  });

  it("should be able to convert twin to twx", async function () {
    const [owner, minter, user, burnPool] = await ethers.getSigners();

    await twin.connect(user).approve(convertTwin.address, ONE);

    const allowance = await twin.allowance(user.address, convertTwin.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await twin.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await convertTwin.connect(user).convert(ONE);

    const userTWXBalance = await twx.balanceOf(user.address);
    const afterUserDopBalance = await twin.balanceOf(user.address);
    const convertTWXBalance = await twx.balanceOf(convertTwin.address);

    const burnPoolDopBalance = await twin.balanceOf(burnPool.address);
    expect(userTWXBalance).to.be.equal(ONE);
    expect(afterUserDopBalance).to.be.equal(ZERO);
    expect(convertTWXBalance).to.be.equal(ZERO);
    expect(burnPoolDopBalance).to.be.equal(ONE);
  });

  it("shall not convert more twin than user have", async function () {
    const [owner, minter, user, burnPool] = await ethers.getSigners();

    await twin.connect(user).approve(convertTwin.address, ONE);

    const allowance = await twin.allowance(user.address, convertTwin.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await twin.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await expect(
      convertTwin.connect(user).convert(ethers.utils.parseEther("2"))
    ).to.be.revertedWith("convert: User has insufficient TWIN Balance");
  });

  it("shall be able to convert twin to twx", async function () {
    const [owner, minter, user, burnPool] = await ethers.getSigners();

    await twin.connect(user).approve(convertTwin.address, ONE);

    const allowance = await twin.allowance(user.address, convertTwin.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await twin.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await expect(convertTwin.connect(user).convert(ZERO)).to.be.revertedWith(
      "Should not be zero"
    );
  });

  it("shall withdraw twx with Admin", async function () {
    const [owner] = await ethers.getSigners();

    let convertTwinBalance = await twx.balanceOf(convertTwin.address);
    expect(convertTwinBalance).to.be.equal(ONE);

    await convertTwin.connect(owner).adminEmergencyWithdraw(ONE);
    const adminBalance = await twx.balanceOf(owner.address);
    expect(adminBalance).to.be.equal(ONE);

    convertTwinBalance = await twx.balanceOf(convertTwin.address);
    expect(convertTwinBalance).to.be.equal(ZERO);
  });

  it("shall not withdraw 0 twx with Admin", async function () {
    const [owner] = await ethers.getSigners();

    await expect(
      convertTwin.connect(owner).adminEmergencyWithdraw(ZERO)
    ).to.be.revertedWith("Should not be zero");
  });
});
