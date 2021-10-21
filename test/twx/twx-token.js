const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { keccak256 } = require("ethers/lib/utils");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");
const MINTER = ethers.utils.id("MINTER");
// UTILS
const fastForwardBlock = (number) => {
  const promises = [];
  for (let i = 0; i <= number; i++) {
    promises.push(ethers.provider.send("evm_mine"));
  }
  return Promise.all(promises);
};

describe("TWX::Mint", function () {
  let _twx;
  let twx;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });
    const [owner, minter, user] = await ethers.getSigners();
    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();
  });

  it("Shall have name SuperDopple", async function () {
    const _name = await twx.name();
    const _symbol = await twx.symbol();
    expect(_name).to.be.equal("TWX");
    expect(_symbol).to.be.equal("TWX");
  });

  it("Shall not able to double init", async function () {
    const [owner] = await ethers.getSigners();
    await expect(twx.initialize(owner.address)).to.be.reverted;
  });

  it("Shall add minter if owner call, Minter should be able to mint", async function () {
    const [owner, minter] = await ethers.getSigners();
    await twx.connect(owner).grantRole(MINTER, minter.address);
    await twx.connect(minter).mint(minter.address, ONE);

    const _amount = await twx.balanceOf(minter.address);
    expect(_amount).to.equal(ONE);
  });

  it("Shall not add minter if not owner", async function () {
    const [, minter] = await ethers.getSigners();
    await expect(
      twx.connect(minter).grantRole(MINTER, minter.address)
    ).to.be.revertedWith("AccessControl: sender must be an admin to grant");
  });

  it("Shall no one can mint", async function () {
    const [owner, minter] = await ethers.getSigners();
    await expect(
      twx.connect(minter).mint(minter.address, ONE)
    ).to.be.revertedWith("Caller is not a minter");
  });

  it("Shall revoke minter", async function () {
    const [owner, minter] = await ethers.getSigners();
    await twx.connect(owner).grantRole(MINTER, minter.address);
    await expect(twx.connect(minter).mint(minter.address, ONE)).not.reverted;
    await twx.connect(owner).revokeRole(MINTER, minter.address);
    await expect(twx.connect(minter).mint(minter.address, ONE)).revertedWith(
      "Caller is not a minter"
    );
  });
});

describe("Super Dopple::Burn from", function () {
  let _twx;
  let twx;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });
    const [owner, minter, burner, user] = await ethers.getSigners();
    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();
    await twx.connect(owner).grantRole(MINTER, minter.address);
    await expect(twx.connect(minter).mint(user.address, ONE)).to.not.reverted;
  });

  it("Shall burn from user 1", async function () {
    const [owner, minter, burner, user] = await ethers.getSigners();

    let _amount;

    _amount = await twx.balanceOf(user.address);
    expect(_amount).to.be.equal(ONE);

    await twx.connect(user).approve(burner.address, ONE);
    await expect(twx.connect(burner).burnFrom(user.address, ONE)).to.not
      .reverted;

    _amount = await twx.balanceOf(user.address);
    expect(_amount).to.be.equal(ZERO);
  });
});

describe("TWX::Transfer", function () {
  let _twx;
  let twx;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });

    const [owner, minter, user1] = await ethers.getSigners();
    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();
    await twx.connect(owner).grantRole(MINTER, minter.address);
    await twx
      .connect(minter)
      .mint(user1.address, ethers.utils.parseEther("2000"));
  });

  it("Shall transfer", async function () {
    const [owner, minter, user1, user2] = await ethers.getSigners();
    await twx.connect(user1).transfer(user2.address, ONE);
    let _amount;
    _amount = await twx.balanceOf(user2.address);
    expect(_amount).to.be.equal(ONE);

    _amount = await twx.balanceOf(user1.address);
    expect(_amount).to.be.equal(ethers.utils.parseEther("1999"));
  });
});
