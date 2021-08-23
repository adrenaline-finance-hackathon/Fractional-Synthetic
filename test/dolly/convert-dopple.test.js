const { expect } = require("chai");
const { ethers } = require("hardhat");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");
const burnPool = "0x000000000000000000000000000000000000dEaD";
const MAX_INT =
  "57896044618658097711785492504343953926634992332820282019728792003956564819967";

describe("Convert Dopple", function () {
  let doppleX;
  let convertDopple;
  let dop;
  beforeEach(async () => {
    const [owner, minter, user] = await ethers.getSigners();

    const DoppleX = await ethers.getContractFactory("DoppleX");
    _doppleX = await DoppleX.deploy();
    await _doppleX.deployed();

    doppleX = await upgrades.deployProxy(DoppleX, [owner.address], {
      kind: "transparent",
    });
    await doppleX.deployed();

    const Mock = await ethers.getContractFactory("Mock");
    dop = await Mock.deploy(ONE);
    await dop.deployed();

    const ConvertDopple = await ethers.getContractFactory("ConvertDopple");
    convertDopple = await ConvertDopple.deploy(
      dop.address,
      doppleX.address,
      burnPool
    );
    await convertDopple.deployed();

    await doppleX
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);
    await doppleX.connect(minter).mint(convertDopple.address, ONE);
    await dop.mint(user.address, ONE);
  });

  it("must have correct balance before test", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    //Convert Balance
    const convertDoppleXBalance = await doppleX.balanceOf(
      convertDopple.address
    );
    expect(convertDoppleXBalance).to.be.equal(ONE);

    //User Balance
    const userDopBalance = await dop.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);
  });

  it("shall convert dop to doppleX", async function () {
    const [, , user] = await ethers.getSigners();

    await dop.connect(user).approve(convertDopple.address, ONE);

    const allowance = await dop.allowance(user.address, convertDopple.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await dop.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await expect(convertDopple.connect(user).convert(ONE)).to.not.reverted;

    const userDoppleXBalance = await doppleX.balanceOf(user.address);
    const afterUserDopBalance = await dop.balanceOf(user.address);
    const convertDoppleXBalance = await doppleX.balanceOf(
      convertDopple.address
    );

    const burnPoolDopBalance = await dop.balanceOf(burnPool);
    expect(userDoppleXBalance).to.be.equal(ONE);
    expect(afterUserDopBalance).to.be.equal(ZERO);
    expect(convertDoppleXBalance).to.be.equal(ZERO);
    expect(burnPoolDopBalance).to.be.equal(ONE);
  });

  it("should be able to convert dop to doppleX", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    await dop.connect(user).approve(convertDopple.address, ONE);

    const allowance = await dop.allowance(user.address, convertDopple.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await dop.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await convertDopple.connect(user).convert(ONE);

    const userDoppleXBalance = await doppleX.balanceOf(user.address);
    const afterUserDopBalance = await dop.balanceOf(user.address);
    const convertDoppleXBalance = await doppleX.balanceOf(
      convertDopple.address
    );

    const burnPoolDopBalance = await dop.balanceOf(burnPool);
    expect(userDoppleXBalance).to.be.equal(ONE);
    expect(afterUserDopBalance).to.be.equal(ZERO);
    expect(convertDoppleXBalance).to.be.equal(ZERO);
    expect(burnPoolDopBalance).to.be.equal(ONE);
  });

  it("shall not convert more dop than user have", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    await dop.connect(user).approve(convertDopple.address, ONE);

    const allowance = await dop.allowance(user.address, convertDopple.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await dop.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await expect(
      convertDopple.connect(user).convert(ethers.utils.parseEther("2"))
    ).to.be.revertedWith("convert: User has insufficient Dop Balance");
  });

  it("shall be able to convert dop to doppleX", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    await dop.connect(user).approve(convertDopple.address, ONE);

    const allowance = await dop.allowance(user.address, convertDopple.address);
    expect(allowance).to.be.equal(ONE);
    const userDopBalance = await dop.balanceOf(user.address);
    expect(userDopBalance).to.be.equal(ONE);

    await expect(convertDopple.connect(user).convert(ZERO)).to.be.revertedWith(
      "Should not be zero"
    );
  });

  it("shall withdraw doppleX with Admin", async function () {
    const [owner] = await ethers.getSigners();

    let convertDoppleBalance = await doppleX.balanceOf(convertDopple.address);
    expect(convertDoppleBalance).to.be.equal(ONE);

    const adminBalanceBefore = await doppleX.balanceOf(owner.address);
    expect(adminBalanceBefore).to.be.equal(ZERO);

    await convertDopple.connect(owner).adminEmergencyWithdraw(ONE);
    const adminBalance = await doppleX.balanceOf(owner.address);
    expect(adminBalance).to.be.equal(ONE);

    convertDoppleBalance = await doppleX.balanceOf(convertDopple.address);
    expect(convertDoppleBalance).to.be.equal(ZERO);
  });

  it("shall not withdraw 0 doppleX with Admin", async function () {
    const [owner] = await ethers.getSigners();

    await expect(
      convertDopple.connect(owner).adminEmergencyWithdraw(ZERO)
    ).to.be.revertedWith("Should not be zero");
  });

  it("Shall reverted if contract has insufficient DoppleX amount when convert");
});
