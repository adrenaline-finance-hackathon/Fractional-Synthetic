const { expect } = require("chai");
const { ethers } = require("hardhat");

const { deployContract, deployProxy, toWei, toPercent } = require("../utils");

const MINTER = ethers.utils.id("MINTER");
const PAUSER = ethers.utils.id("PAUSER");
const MAINTAINER = ethers.utils.id("MAINTAINER");

let owner, minter, feeCollector, pauser, maintainer, result;
let kusd,
  doppleX,
  usdc,
  collateralReserve,
  kusdPool,
  usdcOracle,
  doppleXPair,
  doppleXOracle,
  kusdOracle;

describe("KUSDPool", () => {
  beforeEach(async () => {
    [owner, minter, feeCollector, pauser, maintainer] =
      await ethers.getSigners();
  });

  describe("# Minting", () => {
    it("can mint by `mintAlgorithmicSynth` ratio 0% with no slippage", async () => {
      const tcr = toWei("0");
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq("0");
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

      const _doppleXAmount = toWei("2");
      const _synthOutMin = 0;
      await kusdPool
        .connect(minter)
        .mintAlgorithmicSynth(_doppleXAmount, _synthOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("1"));
    });

    it("can mint by `FractionalSynth` ratio 50%  with no slippage", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("50"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

      const _collateralAmount = toWei("0.5");
      const _doppleXAmount = toWei("1");
      const _synthOutMin = 0;

      await kusdPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("1"));
    });

    it("can mint by `mint1t1Synth` ratio 100%  with no slippage", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

      const _collateralAmount = toWei("1");
      const _synthOutMin = 0;

      await kusdPool
        .connect(minter)
        .mint1t1Synth(_collateralAmount, _synthOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("1"));
    });
  });

  describe("# Redeeming", () => {
    it("can redeem by `redeemAlgorithmicSynth` ratio 0%  with no slippage", async () => {
      const tcr = toWei("0");
      await setupContract(tcr);
      await mintSynth("0", tcr);

      const _synthAmount = toWei("1");
      const _shareOutMin = 0;
      const before = await doppleX.balanceOf(minter.address);
      await kusdPool
        .connect(minter)
        .redeemAlgorithmicSynth(_synthAmount, _shareOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("99"));

      result = await doppleX.balanceOf(minter.address);
      expect(result).to.equals(before.add(toWei("2")));
    });

    it("can redeem by `redeemFractionalSynth` ratio 50%  with no slippage", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);
      await mintSynth("0.5", tcr);

      const _collateralAmount = toWei("0.5");
      const _doppleXAmount = toWei("1");
      const _synthOutMin = 0;

      const before = await kusd.balanceOf(minter.address);
      await kusdPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("1").add(before));
    });

    it("can redeem `redeem1t1Synth` 100% ratio  with no slippage", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await mintSynth("1", tcr);

      const _synthAmount = toWei("1");
      const _minCollateralAmountOut = 0;
      result = await usdc.balanceOf(minter.address);
      const before = await usdc.balanceOf(minter.address);
      await kusdPool
        .connect(minter)
        .redeem1t1Synth(_synthAmount, _minCollateralAmountOut);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("99"));

      result = await usdc.balanceOf(minter.address);
      expect(result).to.equals(before.add(toWei("1")));
    });
  });

  describe("# `getCollateralPrice`", () => {
    it("should get collateral price to 1 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("1");
      await usdcOracle.mock(price);
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
    });

    it("should get collateral price to 0.98 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("0.98");
      await usdcOracle.mock(price);
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("0.98"));
    });

    it("should get collateral price to 1.02 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("1.02");
      await usdcOracle.mock(price);
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1.02"));
    });

    it("should get collateral price to 0 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("0");
      await usdcOracle.mock(price);
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("0"));
    });
  });

  describe("# `getSynthPrice`", () => {
    it("should get synth price to only 1 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));
    });
  });

  describe("# `toggleMinting`", () => {
    it("should not toggle minting if sender has not PAUSER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(kusdPool.connect(minter).toggleMinting()).to.be.revertedWith(
        "Caller is not a pauser"
      );
    });

    it("should toggle minting when current state is unpaused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool.connect(pauser).toggleMinting();
      expect(await kusdPool.mintPaused()).to.be.true;
    });

    it("should toggle minting when current state is paused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool.connect(pauser).toggleMinting();
      await kusdPool.connect(pauser).toggleMinting();
      expect(await kusdPool.mintPaused()).to.be.false;
    });
  });

  describe("# `toggleRedeeming`", () => {
    it("should not toggle redeeming if sender has not PAUSER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(kusdPool.connect(minter).toggleMinting()).to.be.revertedWith(
        "Caller is not a pauser"
      );
    });

    it("should toggle redeeming when current state is unpaused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool.connect(pauser).toggleRedeeming();
      expect(await kusdPool.redeemPaused()).to.be.true;
    });

    it("should toggle redeeming when current state is paused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool.connect(pauser).toggleRedeeming();
      await kusdPool.connect(pauser).toggleRedeeming();
      expect(await kusdPool.redeemPaused()).to.be.false;
    });
  });

  describe("# `setActionDelay`", () => {
    it("should not set action delay if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        kusdPool.connect(minter).setActionDelay(100)
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set action delay if delay = 0", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        kusdPool.connect(maintainer).setActionDelay(0)
      ).to.be.revertedWith("Delay should not be zero");
    });

    it("should set action delay to 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool.connect(maintainer).setActionDelay(100);
      expect(await kusdPool.actionDelay()).to.eq(100);
    });
  });

  describe("# `setMintingFee`", () => {
    it("should not set minting fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        kusdPool.connect(minter).setMintingFee(toWei(toPercent(0.1)))
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set minting fee if new fee more than MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await kusdPool.MAX_FEE();
      await expect(
        kusdPool.connect(maintainer).setMintingFee(MAX_FEE.add(toWei("1")))
      ).to.be.revertedWith("The new fee is too high");
    });

    it("should set minting fee to 0.05%", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool
        .connect(maintainer)
        .setMintingFee(toWei(toPercent("0.05")));
      expect(await kusdPool.mintingFee()).to.eq(toWei("0.0005"));
    });

    it("should set minting fee to MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await kusdPool.MAX_FEE();
      await kusdPool.connect(maintainer).setMintingFee(MAX_FEE);
      expect(await kusdPool.mintingFee()).to.eq(MAX_FEE);
    });

    it("can mint by `FractionalSynth` ratio 50%  with fee", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("50"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));
      expect(await kusdPool.setMintingFee(toWei("0.01")));

      const _collateralAmount = toWei("0.5");
      const _doppleXAmount = toWei("1");
      const _synthOutMin = 0;

      await kusdPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await kusd.balanceOf(minter.address);
      expect(result).to.equals(toWei("0.99"));
    });
  });

  describe("# `setRedemptionFee`", () => {
    it("should not set redemption fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        kusdPool.connect(minter).setRedemptionFee(toWei(toPercent(0.1)))
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set redemption fee if new fee more than MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await kusdPool.MAX_FEE();
      await expect(
        kusdPool.connect(maintainer).setRedemptionFee(MAX_FEE.add(toWei("1")))
      ).to.be.revertedWith("The new fee is too high");
    });

    it("should set redemption fee to 0.05%", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await kusdPool
        .connect(maintainer)
        .setRedemptionFee(toWei(toPercent("0.05")));
      expect(await kusdPool.redemptionFee()).to.eq(toWei("0.0005"));
    });

    it("should set redemption fee to MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await kusdPool.MAX_FEE();
      await kusdPool.connect(maintainer).setRedemptionFee(MAX_FEE);
      expect(await kusdPool.redemptionFee()).to.eq(MAX_FEE);
    });
  });

  describe("# `withdrawFee`", () => {
    it("should not withdraw fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(kusdPool.connect(minter).withdrawFee()).to.be.revertedWith(
        "Caller is not a maintainer"
      );
    });

    it("should withdraw fee if share amount is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      expect(await doppleX.balanceOf(kusdPool.address)).to.eq(0);
      await kusdPool.connect(maintainer).withdrawFee();
    });

    it("should withdraw fee if collateral amount is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      expect(await usdc.balanceOf(kusdPool.address)).to.eq(0);
      await kusdPool.connect(maintainer).withdrawFee();
    });

    it("should withdraw fee if share amount is 100 and callateral is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await doppleX.transfer(kusdPool.address, toWei("100"));
      expect(await doppleX.balanceOf(kusdPool.address)).to.eq(toWei("100"));
      expect(await usdc.balanceOf(kusdPool.address)).to.eq(0);
      await kusdPool.connect(maintainer).withdrawFee();
      expect(await doppleX.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });

    it("should withdraw fee if share amount is zero and collateral amount is 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await usdc.transfer(kusdPool.address, toWei("100"));
      expect(await doppleX.balanceOf(kusdPool.address)).to.eq(0);
      expect(await usdc.balanceOf(kusdPool.address)).to.eq(toWei("100"));
      await kusdPool.connect(maintainer).withdrawFee();
      expect(await usdc.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });

    it("should withdraw fee if share amount is 100 and collateral amount is 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await doppleX.transfer(kusdPool.address, toWei("100"));
      await usdc.transfer(kusdPool.address, toWei("100"));
      expect(await doppleX.balanceOf(kusdPool.address)).to.eq(toWei("100"));
      expect(await usdc.balanceOf(kusdPool.address)).to.eq(toWei("100"));
      await kusdPool.connect(maintainer).withdrawFee();
      expect(await doppleX.balanceOf(maintainer.address)).to.eq(toWei("100"));
      expect(await usdc.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });
  });
});

const setupContract = async (tcr) => {
  // deploy kusd oracle
  kusdOracle = await deployContract("MockPairOracle", [toWei("100")]);

  // deploy kusd
  const _name = "Kelly USD";
  const _symbol = "KUSD";
  [kusd] = await deployProxy("KUSD", [owner.address, _name, _symbol]);
  await kusd.setOracle(kusdOracle.address);

  // deploy TWX
  [doppleX] = await deployProxy("DoppleX", [owner.address]);

  // deploy ReserveTracker
  const [reserveTracker] = await deployProxy("ReserveTracker", [
    doppleX.address,
  ]);

  // deploy collateral reserve
  // deploy pair
  usdc = await deployContract("Mock", [toWei("1000000")]);
  const _r0 = "1000";
  const _r1 = "500";
  doppleXPair = await deployContract("MockPairV2", [
    doppleX.address,
    usdc.address,
    _r0,
    _r1,
  ]);

  // deploy doppleX oracle
  doppleXOracle = await deployContract("MockPairOracleV2", [
    doppleXPair.address,
  ]);

  await doppleXOracle.update();

  [collateralReserve] = await deployProxy("StableCollateralReserve", [
    owner.address,
    ethers.constants.AddressZero,
    doppleX.address,
    doppleXOracle.address,
    feeCollector.address,
  ]);

  [pidController] = await deployProxy("StablePIDController", [
    collateralReserve.address,
    doppleX.address,
    reserveTracker.address,
    doppleXOracle.address,
    kusd.address,
    kusdOracle.address,
  ]);

  // ! set the pid controller address to collateral reserve
  await collateralReserve.setPIDController(pidController.address);

  await collateralReserve.pidController();

  usdcOracle = await deployContract("MockPairOracle", [toWei("1")]);

  await collateralReserve.addOracle(usdcOracle.address);

  usdc = await deployContract("Mock", [toWei("1000000")]);
  await usdc.transfer(minter.address, toWei("1000000"));
  await usdc.mint(owner.address, toWei("1000000"));

  await collateralReserve.addCollateralAddress(
    usdc.address,
    usdcOracle.address
  );

  [kusdPool] = await deployProxy("KUSDPool", [
    collateralReserve.address,
    usdc.address,
    kusd.address,
    doppleX.address,
    owner.address,
  ]);

  await collateralReserve.grantRole(PAUSER, owner.address);
  await collateralReserve.toggleRecollateralize();
  await collateralReserve.toggleBuyBack();
  await collateralReserve.addPool(kusdPool.address);
  await collateralReserve.addSynth(kusd.address);
  await collateralReserve.setGlobalCollateralRatio(tcr);
  await collateralReserve.globalCollateralRatio();
  await doppleX.grantRole(MINTER, owner.address);
  await kusd.grantRole(MINTER, kusdPool.address);
  await doppleX.grantRole(MINTER, kusdPool.address);
  await kusdPool.grantRole(PAUSER, pauser.address);
  await kusdPool.grantRole(MAINTAINER, maintainer.address);
  await kusdPool.grantRole(PAUSER, owner.address);
  await kusdPool.toggleMinting();
  await kusdPool.toggleRedeeming();
  await doppleX.mint(minter.address, toWei("1000000"));
  await doppleX.mint(owner.address, toWei("1000000"));
  await approveAll();
};

const mintSynth = async (amount, tcr) => {
  if (tcr.eq(0)) {
    const _doppleXAmount = toWei("200");
    const _synthOutMin = 0;

    await kusdPool
      .connect(minter)
      .mintAlgorithmicSynth(_doppleXAmount, _synthOutMin);
  } else if (tcr.gte(toWei("1"))) {
    const _collateralAmount = toWei((100 * parseInt(amount)).toString());
    const _synthOutMin = 0;

    await kusdPool
      .connect(minter)
      .mint1t1Synth(_collateralAmount, _synthOutMin);
  } else {
    const _collateralAmount = toWei("50");
    const _doppleXAmount = toWei("100");
    const _synthOutMin = 0;

    await kusdPool
      .connect(minter)
      .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);
  }
};

const approveAll = async () => {
  await doppleX
    .connect(minter)
    .approve(kusdPool.address, ethers.constants.MaxUint256);
  await kusd
    .connect(minter)
    .approve(kusdPool.address, ethers.constants.MaxUint256);
  await usdc
    .connect(minter)
    .approve(kusdPool.address, ethers.constants.MaxUint256);
};
