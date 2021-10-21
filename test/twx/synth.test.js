const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const HALF = ethers.utils.parseEther("0.5");
const ONE = ethers.utils.parseEther("1");
const MAINTAINER = "MAINTAINER";
const MINTER = "MINTER";
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
describe("Synth", async () => {
  let pairOracle, synth, owner, minter, account1, account2;

  before(async () => {
    [owner, minter, account1, account2] = await ethers.getSigners();

    // MockPairOracle
    const MockPairOracle = await ethers.getContractFactory("MockPairOracle");
    pairOracle = await MockPairOracle.deploy(ethers.utils.parseEther("0.5"));
    await pairOracle.deployed();
  });
  beforeEach(async () => {
    //Synth
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

    // Synth Oracle
    const MockPairOracle = await ethers.getContractFactory("MockPairOracle");
    synthOracle = await MockPairOracle.deploy(toWei("1"));
    await synthOracle.deployed();
  });

  it("Deployment should assign...", async () => {
    const _maintainer = ethers.utils.id(MAINTAINER);
    expect(await synth.hasRole(_maintainer, owner.address)).to.eq(true);
    expect(await synth.getRoleMemberCount(_maintainer)).to.eq(1);
  });

  it("only ADMIN is able to setOracle", async () => {
    await expect(
      synth.connect(minter).setOracle(synthOracle.address)
    ).to.be.revertedWith("Caller is not a MAINTAINER");

    await expect(synth.connect(owner).setOracle(synthOracle.address))
      .to.emit(synth, "SetOracle")
      .withArgs(synthOracle.address);

    // getSynthPrice
    expect(await synth.getSynthPrice()).to.eq(toWei("1"));
  });

  it("only MINTER can mint NOT exceed the token cap", async function () {
    const _minterRole = ethers.utils.id(MINTER);
    const _amount = ethers.utils.parseEther("500");
    const _exceedAmount = ethers.utils.parseEther("30000000");
    const _to = account1.address;

    await expect(synth.connect(account2).mint(_to, _amount)).to.be.revertedWith(
      "Caller is not a minter"
    );
    await synth.connect(owner).grantRole(_minterRole, minter.address);
    expect(await synth.hasRole(_minterRole, minter.address)).to.eq(true);
    expect(await synth.getRoleMemberCount(_minterRole)).to.eq(1);
    expect(await synth.balanceOf(_to)).to.eq(ethers.constants.Zero);
    await expect(synth.connect(minter).mint(_to, _amount))
      .to.emit(synth, "Mint")
      .withArgs(_to, _amount);
    expect(await synth.balanceOf(_to)).to.eq(_amount);

    await expect(
      synth.connect(minter).mint(_to, _exceedAmount)
    ).to.be.revertedWith("Minting exceed cap");
  });

  it("only ADMIN is able to add and remove MINTER", async () => {
    const _minterRole = ethers.utils.id(MINTER);
    await expect(
      synth.connect(minter).grantRole(_minterRole, minter.address)
    ).to.be.revertedWith("AccessControl: sender must be an admin to grant");

    expect(await synth.hasRole(_minterRole, minter.address)).to.be.false;
    expect(await synth.getRoleMemberCount(_minterRole)).to.eq(0);

    // add minter
    await synth.connect(owner).grantRole(_minterRole, minter.address);
    expect(await synth.hasRole(_minterRole, minter.address)).to.be.true;
    expect(await synth.getRoleMemberCount(_minterRole)).to.eq(1);

    // remove minter
    await expect(
      synth.connect(minter).revokeRole(_minterRole, minter.address)
    ).to.be.revertedWith("AccessControl: sender must be an admin to revoke");
    expect(await synth.hasRole(_minterRole, minter.address)).to.be.true;
    expect(await synth.getRoleMemberCount(_minterRole)).to.eq(1);

    await synth.connect(owner).revokeRole(_minterRole, minter.address);

    expect(await synth.hasRole(_minterRole, minter.address)).to.be.false;
    expect(await synth.getRoleMemberCount(_minterRole)).to.eq(0);
  });
});
