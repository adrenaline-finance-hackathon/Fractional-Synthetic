const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const {
  toWei,
  toPercent,
  currentTime,
  fastForwardTimestamp,
  deployContract,
  deployProxy,
} = require("../utils");

const addressZero = ethers.constants.AddressZero;

const ONE = toWei("1");
const GR_TOP_BAND = toWei(toPercent("1"));
const GR_BOTTOM_BAND = toWei(toPercent("1"));

// ** global contracts **
let stablePIDController, stableReserveTracker, stableCollateralReserve;

// ** Global Pairs **
let pairShareUsdc, pairShareBusd;

// ** Global Coins **
let kusd, share, usdc, busd;

// ** Global oracle **
let kusdOracle, shareOracle;

const deployAll = async () => {
  const [owner, feeCollector] = await ethers.getSigners();

  // ** COINS **
  // Share
  [share] = await deployProxy("DoppleX", [owner.address]);

  // Synth
  [kusd] = await deployProxy("KUSD", [owner.address, "KELLY", "KUSD"]);

  // Mock USDC
  usdc = await deployContract("MockWithName", [ONE, "USDC", "USDC"]);

  // Mock BUSD
  busd = await deployContract("MockWithName", [ONE, "BUSD", "BUSD"]);

  // ** Pairs **
  // Mock Share-USDC
  pairShareUsdc = await deployContract("MockPair", [
    share.address,
    usdc.address,
    toWei("1"),
    toWei("0.5"),
  ]);

  // Mock Share-BUSD
  pairShareBusd = await deployContract("MockPair", [
    busd.address,
    share.address,
    toWei("1"),
    toWei("0.5"),
  ]);

  // ** Mock kusd oracle **
  kusdOracle = await deployContract("MockPairOracle", [toWei("1")]);
  shareOracle = await deployContract("MockPairOracle", [toWei("1")]);

  // ** Contracts **
  // Stable Reserver Tracker
  [stableReserveTracker] = await deployProxy("StableReserveTracker", [
    share.address,
  ]);

  // Stable Collateral Reserve
  [stableCollateralReserve] = await deployProxy("StableCollateralReserve", [], {
    kind: "transparent",
    initializer: false,
  });

  // StablePIDController
  [stablePIDController] = await deployProxy("StablePIDController", [
    stableCollateralReserve.address,
    share.address,
    stableReserveTracker.address,
    shareOracle.address,
    kusd.address,
    kusdOracle.address,
  ]);

  await stableCollateralReserve.initialize(
    owner.address,
    stablePIDController.address,
    share.address,
    kusdOracle.address,
    feeCollector.address
  );
};

const setPrice = (oracle = kusdOracle, amount) => oracle.mock(toWei(amount));
const setReserves = (pair = pairShareUsdc, r0, r1) =>
  pair.setReserves(toWei(r0), toWei(r1));

describe("Stable PID controller", async () => {
  beforeEach(async () => {
    const [owner, minter, user1] = await ethers.getSigners();

    await deployAll();

    // Add Pairs
    await stableReserveTracker
      .connect(owner)
      .addSharePair(pairShareUsdc.address);
    await stableReserveTracker
      .connect(owner)
      .addSharePair(pairShareBusd.address);

    // set Synth oracle
    await kusd.connect(owner).setOracle(kusdOracle.address);

    await kusd
      .connect(owner)
      .grantRole(await kusd.MINTER_ROLE(), minter.address);

    await kusd.connect(minter).mint(user1.address, toWei("500"));

    await stableCollateralReserve.addSynth(kusd.address);
  });

  it("Deployment should assign with default value correctly...", async () => {
    expect(await stablePIDController.GR_TOP_BAND()).to.equal(
      toWei(toPercent("1"))
    );
    expect(await stablePIDController.GR_BOTTOM_BAND()).to.equal(
      toWei(toPercent("1"))
    );
    expect(await stablePIDController.SYNTH_TOP_BAND()).to.equal(toWei("1.01"));
    expect(await stablePIDController.SYNTH_BOTTOM_BAND()).to.equal(
      toWei("0.99")
    );

    expect(await stablePIDController.growthRatio()).to.equal(0);
    expect(await stablePIDController.isActive()).to.be.true;
    expect(await stablePIDController.useGrowthRatio()).to.be.true;
    expect(await stablePIDController.priceFeedAddress()).to.equal(
      shareOracle.address
    );
    expect(await stablePIDController.stableReserveTrackerAddress()).to.equal(
      stableReserveTracker.address
    );
    expect(await stablePIDController.lastUpdate()).to.equal(0);
    expect(await stablePIDController.internalCooldown()).to.equal(0);
  });

  describe("# Function refreshCollateralRatio", () => {
    const expected = {
      sharePrice: toWei("1"),
      shareReserves: toWei(0.5 + 1), // share reserve each pair
      shareLiquidity: toWei(1 * 1.5), // share reserve * price
      newGrowthRatio: toWei((1 * 1.5) / (500 * 1)), // 0.003 // shareLiquidity / synthTotalSupply*price
    };

    it("should NOT be able to refresh CR if PID controller is NOT active", async () => {
      const [owner] = await ethers.getSigners();

      await stablePIDController.connect(owner).activate(false);
      expect(await stablePIDController.isActive()).to.be.false;
      await expect(
        stablePIDController.connect(owner).refreshCollateralRatio()
      ).to.be.revertedWith("unactive");
    });

    it("should be able to refreshCollateralRatio and get new GrowthRatio", async () => {
      const [owner] = await ethers.getSigners();

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;

      await stablePIDController.refreshCollateralRatio();

      expect(await stablePIDController.growthRatio()).to.eq(
        expected.newGrowthRatio
      );
    });

    it("should be able to refreshCollateralRatio and get new lower TCR in case 0.003 newGrowthRatio > 0 oldGrowthRatio", async () => {
      const [owner] = await ethers.getSigners();

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;

      expect(await stablePIDController.growthRatio()).to.eq(toWei(0));
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      await stablePIDController.refreshCollateralRatio();

      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("99.75"))
      );
      expect(await stablePIDController.growthRatio()).to.eq(
        expected.newGrowthRatio
      );
    });

    it("should be able to refreshCollateralRatio and no refresh because newGrowthRatio doesn't change", async () => {
      const [owner] = await ethers.getSigners();

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;

      expect(await stablePIDController.growthRatio()).to.eq(toWei(0));
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      await stablePIDController.refreshCollateralRatio();

      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("99.75"))
      );
      expect(await stablePIDController.growthRatio()).to.eq(
        expected.newGrowthRatio
      );

      await stablePIDController.refreshCollateralRatio();

      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("99.75"))
      );
      expect(await stablePIDController.growthRatio()).to.eq(
        expected.newGrowthRatio
      );
    });

    describe("## Share price shock to change GrowthRatio", () => {
      it("should be able to refreshCollateralRatio and get new lower TCR in case newGrowthRatio > old more than GR_TOP_BAND", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        await setPrice(shareOracle, 10000);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.50"))
        );
      });

      it("should be able to refreshCollateralRatio and get new higher TCR in case newGrowthRatio < old which lower than GR_BOTTOM_BAND", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        await setPrice(shareOracle, 0.01);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
      });
    });

    describe("## Share reserve shock to change GrowthRatio", () => {
      it("should be stepDown TCR Reserve go higher 1% growth ratio", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        await setReserves(pairShareUsdc, 10000, 10000);
        await setReserves(pairShareBusd, 10000, 10000);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.50"))
        );
      });

      it("should be stepUp TCR Reserve go lower 1% growth ratio", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        await setReserves(pairShareUsdc, 0.001, 0.001);
        await setReserves(pairShareBusd, 0.001, 0.001);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
      });
    });

    describe("## Synth price shock in condition out of PEG", () => {
      it("should be able to refreshCollateralRatio and get new higher TCR in case price lower than 0.995", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 0.01);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
      });

      it("should be able to refreshCollateralRatio and get new lower TCR in case price higher than 0.995", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 10);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.50"))
        );
      });

      it("should do nothing if synth price equals to top band 1.01 (= SYNTH_TOP_BAND)", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 1.01);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );
      });

      it("should stepDownTCR if synth price equals to bottom band 0.99 (= SYNTH_BOTTOM_BAND)", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 0.99);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.5"))
        );
      });

      it("should stepDownTCR price 1.02 (> SYNTH_TOP_BAND) ", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 1.02);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.50"))
        );
      });

      it("should stepUpTCR price 0.98 (< SYNTH_BOTTOM_BAND) ", async () => {
        const [owner] = await ethers.getSigners();

        await stablePIDController.connect(owner).activate(true);
        expect(await stablePIDController.isActive()).to.be.true;
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("99.75"))
        );

        // price shock
        await setPrice(kusdOracle, 0.98);

        await stablePIDController.refreshCollateralRatio();
        expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );
      });
    });

    it("should not exceed 100% TCR", async () => {
      const [owner] = await ethers.getSigners();

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      // price shock 100% go down
      await setPrice(kusdOracle, 0.01);

      await stablePIDController.refreshCollateralRatio();
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      await stablePIDController.refreshCollateralRatio();
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );
    });

    it("should not below 0% TCR", async () => {
      const [owner] = await ethers.getSigners();
      await stableCollateralReserve.setGlobalCollateralRatio(0);

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("0"))
      );
      await expect(stablePIDController.refreshCollateralRatio()).to.be.reverted;
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("0"))
      );

      await setPrice(kusdOracle, 0.01);

      await stablePIDController.refreshCollateralRatio();
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("0.25"))
      );

      await stablePIDController.refreshCollateralRatio();
      expect(await stableCollateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("0.50"))
      );
    });
  });

  describe("# Cooldown", () => {
    it("owner is able to set internal cooldown", async () => {
      const [owner] = await ethers.getSigners();
      await stablePIDController.connect(owner).setInternalCooldown("60");
      expect((await stablePIDController.internalCooldown()).toString()).to.eq(
        "60"
      );
    });

    it("should NOT be able to refresh CR within cool down period", async () => {
      const [owner] = await ethers.getSigners();
      // kusdTotalSupply * price
      const expected = {
        sharePrice: toWei("1"),
        shareReserves: toWei(0.5 + 1),
        shareLiquidity: toWei(1 * 1.5),
        newGrowthRatio: toWei((1 * 1.5) / (500 * 1)), // 0.003
      };

      // let it passes the first time to set lastUpdate
      const _currentTime = await currentTime();
      const _plus60secs = new Date(_currentTime * 1000).setSeconds(
        new Date(_currentTime * 1000).getSeconds() + 60
      );

      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.be.true;

      await stablePIDController.connect(owner).setInternalCooldown("60");
      const _internalCooldown = await stablePIDController.internalCooldown();
      expect(_internalCooldown).to.eq("60");

      await fastForwardTimestamp(60);

      const _newCurrentTime = await currentTime();
      expect(_newCurrentTime).to.gte(_plus60secs / 1000);

      await stablePIDController.refreshCollateralRatio();

      const _anotherCurrentTime = await currentTime();
      expect(await stablePIDController.lastUpdate()).to.eq(_anotherCurrentTime);

      const sharePrice = await shareOracle.consult(share.address, toWei("1"));
      expect(sharePrice).to.be.equal(expected.sharePrice);

      const shareReserves = await stableReserveTracker.getShareReserves();
      expect(shareReserves).to.be.equal(expected.shareReserves);

      const growthRatio = await stablePIDController.growthRatio();
      expect(growthRatio).to.eq(expected.newGrowthRatio);

      // fastForwardTimestamp less than internalCooldown
      expect(await stablePIDController.lastUpdate()).to.not.eq(0);
      expect(await stablePIDController.lastUpdate()).to.eq(_anotherCurrentTime);
      expect(await stablePIDController.isActive()).to.eq(true);

      await fastForwardTimestamp(50);

      await expect(
        stablePIDController.refreshCollateralRatio()
      ).to.be.revertedWith("internal cooldown not passed");

      expect(await stablePIDController.lastUpdate()).to.eq(_anotherCurrentTime);
      expect(await stablePIDController.growthRatio()).to.eq(
        expected.newGrowthRatio
      );
    });
  });

  describe("# Access Control", () => {
    it("owner is able to activate PID controller", async () => {
      const [owner] = await ethers.getSigners();
      expect(await stablePIDController.isActive()).to.be.true;
      await stablePIDController.connect(owner).activate(true);
      expect(await stablePIDController.isActive()).to.eq(true);
    });

    it("owner is able to set reserve tracker", async () => {
      await expect(
        stablePIDController.setReserveTracker(stableReserveTracker.address)
      ).to.not.reverted;
    });

    it("owner is able to set growth ratio bands", async () => {
      const [owner] = await ethers.getSigners();
      await stablePIDController
        .connect(owner)
        .setGrowthRatioBands(toWei(toPercent("4")), toWei(toPercent("5")));
      expect(await stablePIDController.GR_TOP_BAND()).to.eq(
        toWei(toPercent("4"))
      );
      expect(await stablePIDController.GR_BOTTOM_BAND()).to.eq(
        toWei(toPercent("5"))
      );
    });

    it("should be able to set Synth", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(owner).setCollateralReserve(addressZero)
      ).to.not.reverted;
    });

    it("should be able to set Share contract address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(owner).setShareContractAddress(addressZero)
      ).to.not.reverted;
    });

    it("should be able to set price feed contract address", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        stablePIDController
          .connect(owner)
          .setPriceFeedAddress(kusdOracle.address)
      ).to.not.reverted;
    });

    it("should be able to set new GR ", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(owner).setGrowthRatioBands(1e12, 1e12)
      ).not.to.reverted;
      expect(await stablePIDController.GR_TOP_BAND()).to.eq(1e12);
      expect(await stablePIDController.GR_BOTTOM_BAND()).to.eq(1e12);
    });

    it("owner is able to DE-activate PID controller", async function () {
      const [owner] = await ethers.getSigners();
      await expect(stablePIDController.connect(owner).activate(false)).to.not
        .reverted;
      expect(await stablePIDController.isActive()).to.eq(false);
    });

    it("non owner is NOT able to active PID controller", async function () {
      const [owner, , user1] = await ethers.getSigners();
      await stablePIDController.connect(owner).activate(false);
      expect(await stablePIDController.isActive()).to.be.false;
      await expect(stablePIDController.connect(user1).activate(true)).to.be
        .reverted;
      expect(await stablePIDController.isActive()).to.eq(false);
    });

    it("non owner is NOT able to DE-active PID controller", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(stablePIDController.connect(user1).activate(false)).to.be
        .reverted;
      expect(await stablePIDController.isActive()).to.be.true;
    });

    it("non owner is NOT able to set reserve tracker", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setReserveTracker(addressZero)
      ).to.be.reverted;
      expect(await stablePIDController.stableReserveTrackerAddress()).to.eq(
        stableReserveTracker.address
      );
    });

    it("non owner is NOT able to set growth ratio bands", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setGrowthRatioBands(1e16, 1e16)
      ).to.be.reverted;
      expect(await stablePIDController.GR_TOP_BAND()).to.eq(GR_TOP_BAND);
      expect(await stablePIDController.GR_BOTTOM_BAND()).to.eq(GR_BOTTOM_BAND);
    });

    it("non owner is NOT able to set internal cooldown", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setInternalCooldown(60 - 10)
      ).to.be.reverted;
      expect(await stablePIDController.internalCooldown()).to.eq(0);
    });

    it("non owner should NOT be able to set Synth", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setCollateralReserve(addressZero)
      ).to.be.reverted;
    });

    it("non owner should NOT be able to set Share contract address", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setShareContractAddress(addressZero)
      ).to.be.reverted;
    });

    it("non owner should NOT be able to set price feed contract address", async function () {
      const [, , user1] = await ethers.getSigners();
      await expect(
        stablePIDController.connect(user1).setPriceFeedAddress(addressZero)
      ).to.be.reverted;
    });
  });

  describe("# `setSynthOracle`", () => {
    it("should not setSynthOracle if sender has not MAINTAINER role", async () => {
      const [, , user1] = await ethers.getSigners();
      const newOracle = await deployContract("MockPairOracle", [toWei("0.99")]);
      await expect(
        stablePIDController.connect(user1).setSynthOracle(newOracle.address)
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should setSynthOracle to another oracle", async () => {
      const [owner] = await ethers.getSigners();
      const newOracle = await deployContract("MockPairOracle", [toWei("0.99")]);
      await stablePIDController
        .connect(owner)
        .setSynthOracle(newOracle.address);
      expect(await stablePIDController.synthOracleAddress()).to.eq(
        newOracle.address
      );
    });
  });
});
