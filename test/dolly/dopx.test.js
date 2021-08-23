const { expect } = require("chai");
const { ethers } = require("hardhat");
const { toWei } = require("../utils");

// CONSTANTS
const ONE = toWei("1");
const ZERO = toWei("0");

describe("DopX::Mint", function () {
  let _superDop;
  let superDop;
  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    const SuperDop = await ethers.getContractFactory("DoppleX");
    _superDop = await SuperDop.deploy();
    await _superDop.deployed();

    superDop = await upgrades.deployProxy(SuperDop, [owner.address], {
      kind: "transparent",
    });
    await superDop.deployed();
  });

  it("Shall have name DoppleX", async function () {
    const _name = await superDop.name();
    const _symbol = await superDop.symbol();
    expect(_name).to.be.equal("Dopple Exchange Token");
    expect(_symbol).to.be.equal("DOPX");
  });

  it("Shall not able to double init", async function () {
    const [owner] = await ethers.getSigners();
    await expect(superDop.initialize(owner.address)).to.be.reverted;
  });

  it("Shall add minter if owner call, Minter should be able to mint", async function () {
    const [owner, minter] = await ethers.getSigners();
    await superDop
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);
    await superDop.connect(minter).mint(minter.address, ONE);

    const _amount = await superDop.balanceOf(minter.address);
    expect(_amount).to.equal(ONE);
  });

  it("Shall not add minter if not owner", async function () {
    const [, minter, user1] = await ethers.getSigners();
    await expect(
      superDop
        .connect(user1)
        .grantRole(ethers.utils.id("MINTER"), minter.address)
    ).to.be.revertedWith("AccessControl: sender must be an admin to grant");
  });

  it("Shall no one can mint", async function () {
    const [, minter] = await ethers.getSigners();
    await expect(
      superDop.connect(minter).mint(minter.address, ONE)
    ).to.be.revertedWith("Caller is not a minter");
  });

  it("Shall revoke minter", async function () {
    const [owner, minter] = await ethers.getSigners();
    await superDop
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);

    await expect(superDop.connect(minter).mint(minter.address, ONE)).to.not
      .reverted;

    await superDop
      .connect(owner)
      .revokeRole(ethers.utils.id("MINTER"), minter.address);

    await expect(
      superDop.connect(minter).mint(minter.address, ONE)
    ).revertedWith("Caller is not a minter");
  });
});

describe("Super Dopple::Burn from", function () {
  let _superDop;
  let superDop;
  beforeEach(async () => {
    const [owner, minter, burner, user] = await ethers.getSigners();
    const SuperDop = await ethers.getContractFactory("DoppleX");
    _superDop = await SuperDop.deploy();
    await _superDop.deployed();

    superDop = await upgrades.deployProxy(SuperDop, [owner.address], {
      kind: "transparent",
    });
    await superDop.deployed();
    await superDop
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);
    await expect(superDop.connect(minter).mint(user.address, ONE)).to.not
      .reverted;
  });

  it("Shall burn from user 1", async function () {
    const [, , burner, user] = await ethers.getSigners();

    let _amount;

    _amount = await superDop.balanceOf(user.address);
    expect(_amount).to.be.equal(ONE);

    await superDop.connect(user).approve(burner.address, ONE);
    await expect(superDop.connect(burner).burnFrom(user.address, ONE)).to.not
      .reverted;

    _amount = await superDop.balanceOf(user.address);
    expect(_amount).to.be.equal(ZERO);
  });
});

describe("Super Dopple::Transfer", function () {
  let _superDop;
  let superDop;
  beforeEach(async () => {
    const [owner, minter, user1] = await ethers.getSigners();
    const SuperDop = await ethers.getContractFactory("DoppleX");
    _superDop = await SuperDop.deploy();
    await _superDop.deployed();

    superDop = await upgrades.deployProxy(SuperDop, [owner.address], {
      kind: "transparent",
    });
    await superDop.deployed();
    await superDop
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);
    await superDop.connect(minter).mint(user1.address, toWei("2000"));
  });

  it("Shall transfer", async function () {
    const [, , user1, user2] = await ethers.getSigners();
    await superDop.connect(user1).transfer(user2.address, ONE);
    let _amount;
    _amount = await superDop.balanceOf(user2.address);
    expect(_amount).to.be.equal(ONE);

    _amount = await superDop.balanceOf(user1.address);
    expect(_amount).to.be.equal(toWei("1999"));
  });
});

describe("DoppleX::AccessControl", () => {
  let dopX;
  const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;

  beforeEach(async () => {
    const [owner, minter] = await ethers.getSigners();
    const DopX = await ethers.getContractFactory("DoppleX");
    const _dopX = await DopX.deploy();
    await _dopX.deployed();

    dopX = await upgrades.deployProxy(DopX, [owner.address], {
      kind: "transparent",
    });
    await dopX.deployed();
    await dopX
      .connect(owner)
      .grantRole(ethers.utils.id("MINTER"), minter.address);
  });

  it("should be able get member count of DEFAULT_ADMIN_ROLE to be 1", async () => {
    const count = await dopX.getRoleMemberCount(DEFAULT_ADMIN_ROLE);

    expect(count.toString()).to.be.equal("1");
  });

  it("should be able get member of DEFAULT_ADMIN_ROLE to be owner address", async () => {
    const [owner] = await ethers.getSigners();
    const admin = await dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "0");

    expect(admin).to.be.equal(owner.address);
  });

  it("should be able to get member count of MINTER to be 1", async () => {
    const count = await dopX.getRoleMemberCount(ethers.utils.id("MINTER"));

    expect(count.toString()).to.be.equal("1");
  });

  it("should be able to get member of MINTER to be minter", async () => {
    const [, expectMinter] = await ethers.getSigners();

    const minter = await dopX.getRoleMember(ethers.utils.id("MINTER"), "0");

    expect(expectMinter.address).to.be.equal(minter);
  });

  it("should be able to add new admin in DEFAULT_ADMIN_ROLE", async () => {
    const [owner, , newAdmin] = await ethers.getSigners();
    const beforeCount = await dopX.getRoleMemberCount(DEFAULT_ADMIN_ROLE);

    expect(beforeCount.toString()).to.be.equal("1");

    // add new admin
    await dopX.grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address);

    expect(
      (await dopX.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).toString()
    ).to.be.equal("2");

    expect(await dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "0")).to.be.equal(
      owner.address
    );

    expect(await dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "1")).to.be.equal(
      newAdmin.address
    );

    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.true;
    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;

    await expect(dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "2")).to.be.reverted;
  });

  it("should be able to add new admin in DEFAULT_ADMIN_ROLE then revoke old admin", async () => {
    const [owner, , newAdmin] = await ethers.getSigners();

    expect(
      (await dopX.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).toString()
    ).to.be.equal("1");

    // add new admin
    await dopX.grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address);
    await dopX.revokeRole(DEFAULT_ADMIN_ROLE, owner.address);

    expect(
      (await dopX.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).toString()
    ).to.be.equal("1");

    expect(await dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "0")).to.be.equal(
      newAdmin.address
    );

    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.true;
    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.false;

    await expect(dopX.getRoleMember(DEFAULT_ADMIN_ROLE, "1")).to.be.reverted;
  });

  it("should be reverted to grantRole by old admin after old admin revoked", async () => {
    const [owner, , newAdmin] = await ethers.getSigners();
    // add new admin
    await dopX.grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address);
    await dopX.revokeRole(DEFAULT_ADMIN_ROLE, owner.address);

    await expect(
      dopX.grantRole(DEFAULT_ADMIN_ROLE, owner.address)
    ).to.be.revertedWith("AccessControl: sender must be an admin to grant");
  });

  it("should be able to grantRole by new admin after old admin revoked", async () => {
    const [owner, , newAdmin, newAdmin2] = await ethers.getSigners();
    // add new admin
    await dopX.grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address);
    await dopX.revokeRole(DEFAULT_ADMIN_ROLE, owner.address);

    await dopX
      .connect(newAdmin)
      .grantRole(DEFAULT_ADMIN_ROLE, newAdmin2.address);

    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.false;
    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.true;
    expect(await dopX.hasRole(DEFAULT_ADMIN_ROLE, newAdmin2.address)).to.be
      .true;
  });
});
