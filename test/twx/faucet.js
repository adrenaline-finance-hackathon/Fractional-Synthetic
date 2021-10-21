const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");

// UTILS
const fastForwardBlock = (number) => {
  const promises = [];
  for (let i = 0; i <= number; i++) {
    promises.push(ethers.provider.send("evm_mine"));
  }
  return Promise.all(promises);
};

describe("Faucet", function () {
  let kusd;
  let twx;
  let faucet;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });
    const MINTER = ethers.utils.id("MINTER");
    const [owner, minter, user] = await ethers.getSigners();

    const KUSD = await ethers.getContractFactory("KUSD");
    _kusd = await KUSD.deploy();
    await _kusd.deployed();

    kusd = await upgrades.deployProxy(
      KUSD,
      [owner.address, "Kelly USD", "KUSD"],
      {
        kind: "transparent",
      }
    );
    await kusd.deployed();

    const TWX = await ethers.getContractFactory("TWX");
    _twx = await KUSD.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();

    const Faucet = await ethers.getContractFactory("FaucetV2");
    _faucet = await Faucet.deploy();
    await _faucet.deployed();

    faucet = await upgrades.deployProxy(
      Faucet,
      [owner.address, kusd.address, twx.address],
      {
        kind: "transparent",
      }
    );
    await faucet.deployed();

    await kusd.connect(owner).grantRole(MINTER, minter.address);
    await kusd
      .connect(minter)
      .mint(faucet.address, ethers.utils.parseEther("10000"));

    await twx.connect(owner).grantRole(MINTER, minter.address);
    await twx
      .connect(minter)
      .mint(faucet.address, ethers.utils.parseEther("10000"));
  });

  it("must have correct balance before test", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    //Convert Balance
    let balance = await kusd.balanceOf(faucet.address);
    expect(balance).to.be.equal(ethers.utils.parseEther("10000"));

    balance = await twx.balanceOf(faucet.address);
    expect(balance).to.be.equal(ethers.utils.parseEther("10000"));
  });

  it("shall faucet kusd and dopx to user", async function () {
    const [owner, minter, user] = await ethers.getSigners();

    await expect(faucet.connect(user).claim(ethers.utils.parseEther("1000"))).to
      .not.reverted;
    const balance = await kusd.balanceOf(user.address);
    expect(balance).to.be.equal(ethers.utils.parseEther("1000"));
  });
  it("shall not faucet kusd and dopx more than 1000", async function () {
    const [owner, minter, user] = await ethers.getSigners();
    await expect(
      faucet.connect(user).claim(ethers.utils.parseEther("1001"))
    ).to.revertedWith("Claim reached maximum amount");
  });

  it("shall not faucet sum of kusd more than 1000", async function () {
    const [owner, minter, user] = await ethers.getSigners();
    await expect(faucet.connect(user).claim(ethers.utils.parseEther("1000"))).to
      .not.reverted;
    await expect(
      faucet.connect(user).claim(ethers.utils.parseEther("1"))
    ).to.revertedWith("Claim reached maximum amount");
  });
});
