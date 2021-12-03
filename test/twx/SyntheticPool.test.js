const { expect } = require("chai");
const { ethers } = require("hardhat");

const { deployContract, deployProxy, toWei, toPercent } = require("../utils");

const MINTER = ethers.utils.id("MINTER");
const PAUSER = ethers.utils.id("PAUSER");
const MAINTAINER = ethers.utils.id("MAINTAINER");

let owner, minter, feeCollector, pauser, maintainer, result;
let synth,
  doppleX,
  usdc,
  collateralReserve,
  syntheticPool,
  usdcOracle,
  doppleXPair,
  doppleXOracle,
  synthOracle;

describe("SyntheticPool", () => {
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
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await syntheticPool.getSynthPrice()).to.eq(toWei("1"));

      const _doppleXAmount = toWei("2");
      const _synthOutMin = 0;
      await syntheticPool
        .connect(minter)
        .mintAlgorithmicSynth(_doppleXAmount, _synthOutMin);

      result = await synth.balanceOf(minter.address);
      expect(result).to.equals(toWei("1"));
    });

    it("can mint by `FractionalSynth` ratio 50%  with no slippage", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("50"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await syntheticPool.getSynthPrice()).to.eq(toWei("1"));

      const _collateralAmount = toWei("0.5");
      const _doppleXAmount = toWei("1");
      const _synthOutMin = 0;

      await syntheticPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await synth.balanceOf(minter.address);
      expect(result).to.equals(toWei("1"));
    });

    it("can mint by `mint1t1Synth` ratio 100%  with no slippage", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await syntheticPool.getSynthPrice()).to.eq(toWei("1"));

      const _collateralAmount = toWei("1");
      const _synthOutMin = 0;

      await syntheticPool
        .connect(minter)
        .mint1t1Synth(_collateralAmount, _synthOutMin);

      result = await synth.balanceOf(minter.address);
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
      await syntheticPool
        .connect(minter)
        .redeemAlgorithmicSynth(_synthAmount, _shareOutMin);

      result = await synth.balanceOf(minter.address);
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

      const before = await synth.balanceOf(minter.address);
      await syntheticPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await synth.balanceOf(minter.address);
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
      await syntheticPool
        .connect(minter)
        .redeem1t1Synth(_synthAmount, _minCollateralAmountOut);

      result = await synth.balanceOf(minter.address);
      expect(result).to.equals(toWei("99"));

      result = await usdc.balanceOf(minter.address);
      expect(result).to.equals(before.add(toWei("1")));
    });
  });

  describe("# Redeeming with several numbers", () => {
    describe("## Function `redeem1t1Synth`", () => {
      describe("### TCR 90% ECR 100%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with fee 0.8%");

        it("should throw error if someone reCollateral before redeem");
      });

      describe("### TCR 100% ECR 100%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with fee 0.8%");
      });

      describe("### TCR 0% ECR 100%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with fee 0.8%");
      });

      describe("### TCR 0% ECR 80%", () => {
        it("should be revertedWith `Collateral ratio must be == 1`");
      });

      describe("### TCR 0% ECR 0%", () => {
        it("should be revertedWith `Collateral ratio must be == 1`");
      });

      describe("### TCR 0% ECR 200%", () => {
        it("should be revertedWith `Collateral ratio must be == 1`");
      });
    });

    describe("## Function `redeemAlgorithmicSynth`", () => {
      describe("### TCR 90% ECR 0%", () => {
        it("should be revertedWith `Collateral ratio must be 0`");
      });

      describe("### TCR 90% ECR 2000%", () => {
        it("should be revertedWith `Collateral ratio must be 0`");
      });

      describe("### TCR 100% ECR 0%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with Synth price increase");
        it("should be able to redeem with Synth price decrease");
        it("should be able to redeem with fee 0.8%");
      });
    });

    describe("## Function `redeemFractionalSynth`", () => {
      describe("### TCR 90% ECR 0%", () => {
        it(
          "should be revertedWith `Collateral ratio needs to be lower than 100% or higher than 0%`"
        );
      });

      describe("### TCR 90% ECR 2000%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with Synth price increase");
        it("should be able to redeem with Synth price decrease");
        it("should be able to redeem with fee 0.8%");
      });

      describe("### TCR 100% ECR 50%", () => {
        it("should be able to redeem with synthPrice 1$, collat 1$");
        it("should be able to redeem with synthPrice 100$ , collat 50$");
        it("should be able to redeem with Synth price increase");
        it("should be able to redeem with Synth price decrease");
        it("should be able to redeem with fee 0.8%");
      });
    });
  });

  describe("# `getCollateralPrice`", () => {
    it("should get collateral price to 1 USD", async () => {
      const tcr = toWei(toPercent("1"));
      await setupContract(tcr);
      const price = toWei("1");
      await usdcOracle.mock(price);
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1"));
    });

    it("should get collateral price to 0.98 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("0.98");
      await usdcOracle.mock(price);
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("0.98"));
    });

    it("should get collateral price to 1.02 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("1.02");
      await usdcOracle.mock(price);
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1.02"));
    });

    it("should get collateral price to 0 USD", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const price = toWei("0");
      await usdcOracle.mock(price);
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("0"));
    });
  });

  describe("# `getSynthPrice`", () => {
    it("should get synth price to only 1 USD", async () => {
      const tcr = toWei(toPercent("1"));
      await setupContract(tcr);
      expect(await syntheticPool.getSynthPrice()).to.eq(toWei("1"));
    });
  });

  describe("# `toggleMinting`", () => {
    it("should not toggle minting if sender has not PAUSER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).toggleMinting()
      ).to.be.revertedWith("Caller is not a pauser");
    });

    it("should toggle minting when current state is unpaused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool.connect(pauser).toggleMinting();
      expect(await syntheticPool.mintPaused()).to.be.true;
    });

    it("should toggle minting when current state is paused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool.connect(pauser).toggleMinting();
      await syntheticPool.connect(pauser).toggleMinting();
      expect(await syntheticPool.mintPaused()).to.be.false;
    });
  });

  describe("# `toggleRedeeming`", () => {
    it("should not toggle redeeming if sender has not PAUSER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).toggleMinting()
      ).to.be.revertedWith("Caller is not a pauser");
    });

    it("should toggle redeeming when current state is unpaused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool.connect(pauser).toggleRedeeming();
      expect(await syntheticPool.redeemPaused()).to.be.true;
    });

    it("should toggle redeeming when current state is paused", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool.connect(pauser).toggleRedeeming();
      await syntheticPool.connect(pauser).toggleRedeeming();
      expect(await syntheticPool.redeemPaused()).to.be.false;
    });
  });

  describe("# `setActionDelay`", () => {
    it("should not set action delay if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).setActionDelay(100)
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set action delay if delay = 0", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(maintainer).setActionDelay(0)
      ).to.be.revertedWith("Delay should not be zero");
    });

    it("should set action delay to 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool.connect(maintainer).setActionDelay(100);
      expect(await syntheticPool.actionDelay()).to.eq(100);
    });
  });

  describe("# `setMintingFee`", () => {
    it("should not set minting fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).setMintingFee(toWei(toPercent(0.1)))
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set minting fee if new fee more than MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await syntheticPool.MAX_FEE();
      await expect(
        syntheticPool.connect(maintainer).setMintingFee(MAX_FEE.add(toWei("1")))
      ).to.be.revertedWith("The new fee is too high");
    });

    it("should set minting fee to 0.05%", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool
        .connect(maintainer)
        .setMintingFee(toWei(toPercent("0.05")));
      expect(await syntheticPool.mintingFee()).to.eq(toWei("0.0005"));
    });

    it("should set minting fee to MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await syntheticPool.MAX_FEE();
      await syntheticPool.connect(maintainer).setMintingFee(MAX_FEE);
      expect(await syntheticPool.mintingFee()).to.eq(MAX_FEE);
    });

    it("can mint by `FractionalSynth` ratio 50%  with fee", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("50"))
      );
      expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
      expect(await syntheticPool.getCollateralPrice()).to.eq(toWei("1"));
      expect(await syntheticPool.getSynthPrice()).to.eq(toWei("1"));
      expect(await syntheticPool.setMintingFee(toWei("0.01")));

      const _collateralAmount = toWei("0.5");
      const _doppleXAmount = toWei("1");
      const _synthOutMin = 0;

      await syntheticPool
        .connect(minter)
        .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);

      result = await synth.balanceOf(minter.address);
      expect(result).to.equals(toWei("0.99"));
    });
  });

  describe("# `setRedemptionFee`", () => {
    it("should not set redemption fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).setRedemptionFee(toWei(toPercent(0.1)))
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should not set redemption fee if new fee more than MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await syntheticPool.MAX_FEE();
      await expect(
        syntheticPool
          .connect(maintainer)
          .setRedemptionFee(MAX_FEE.add(toWei("1")))
      ).to.be.revertedWith("The new fee is too high");
    });

    it("should set redemption fee to 0.05%", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await syntheticPool
        .connect(maintainer)
        .setRedemptionFee(toWei(toPercent("0.05")));
      expect(await syntheticPool.redemptionFee()).to.eq(toWei("0.0005"));
    });

    it("should set redemption fee to MAX_FEE", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      const MAX_FEE = await syntheticPool.MAX_FEE();
      await syntheticPool.connect(maintainer).setRedemptionFee(MAX_FEE);
      expect(await syntheticPool.redemptionFee()).to.eq(MAX_FEE);
    });
  });

  describe("# `withdrawFee`", () => {
    it("should not withdraw fee if sender has not MAINTAINER role", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await expect(
        syntheticPool.connect(minter).withdrawFee()
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("should withdraw fee if share amount is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      expect(await doppleX.balanceOf(syntheticPool.address)).to.eq(0);
      await syntheticPool.connect(maintainer).withdrawFee();
    });

    it("should withdraw fee if collateral amount is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      expect(await usdc.balanceOf(syntheticPool.address)).to.eq(0);
      await syntheticPool.connect(maintainer).withdrawFee();
    });

    it("should withdraw fee if share amount is 100 and callateral is zero", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await doppleX.transfer(syntheticPool.address, toWei("100"));
      expect(await doppleX.balanceOf(syntheticPool.address)).to.eq(
        toWei("100")
      );
      expect(await usdc.balanceOf(syntheticPool.address)).to.eq(0);
      await syntheticPool.connect(maintainer).withdrawFee();
      expect(await doppleX.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });

    it("should withdraw fee if share amount is zero and collateral amount is 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await usdc.transfer(syntheticPool.address, toWei("100"));
      expect(await doppleX.balanceOf(syntheticPool.address)).to.eq(0);
      expect(await usdc.balanceOf(syntheticPool.address)).to.eq(toWei("100"));
      await syntheticPool.connect(maintainer).withdrawFee();
      expect(await usdc.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });

    it("should withdraw fee if share amount is 100 and collateral amount is 100", async () => {
      const tcr = toWei(toPercent("100"));
      await setupContract(tcr);
      await doppleX.transfer(syntheticPool.address, toWei("100"));
      await usdc.transfer(syntheticPool.address, toWei("100"));
      expect(await doppleX.balanceOf(syntheticPool.address)).to.eq(
        toWei("100")
      );
      expect(await usdc.balanceOf(syntheticPool.address)).to.eq(toWei("100"));
      await syntheticPool.connect(maintainer).withdrawFee();
      expect(await doppleX.balanceOf(maintainer.address)).to.eq(toWei("100"));
      expect(await usdc.balanceOf(maintainer.address)).to.eq(toWei("100"));
    });
  });
});

const setupContract = async (tcr) => {
  // deploy synth oracle
  synthOracle = await deployContract("MockPairOracle", [toWei("1")]);

  // deploy synth
  const _name = "kelly APPLE Stock";
  const _symbol = "kAAPL";
  [synth] = await deployProxy("Synth", [owner.address, _name, _symbol]);
  await synth.setOracle(synthOracle.address);

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

  [collateralReserve] = await deployProxy("CollateralReserve", [
    owner.address,
    ethers.constants.AddressZero,
    doppleX.address,
    doppleXOracle.address,
    feeCollector.address,
  ]);

  [pidController] = await deployProxy("PIDController", [
    collateralReserve.address,
    doppleX.address,
    reserveTracker.address,
    doppleXOracle.address,
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

  [syntheticPool] = await deployProxy("SyntheticPool", [
    collateralReserve.address,
    usdc.address,
    synth.address,
    doppleX.address,
    owner.address,
  ]);

  await collateralReserve.grantRole(PAUSER, owner.address);
  await collateralReserve.toggleRecollateralize();
  await collateralReserve.toggleBuyBack();
  await collateralReserve.addPool(syntheticPool.address);
  await collateralReserve.addSynth(synth.address);
  await collateralReserve.setGlobalCollateralRatio(tcr);
  await collateralReserve.globalCollateralRatio();
  await doppleX.grantRole(MINTER, owner.address);
  await synth.grantRole(MINTER, syntheticPool.address);
  await doppleX.grantRole(MINTER, syntheticPool.address);
  await syntheticPool.grantRole(PAUSER, pauser.address);
  await syntheticPool.grantRole(MAINTAINER, maintainer.address);
  await syntheticPool.grantRole(PAUSER, owner.address);
  await syntheticPool.toggleMinting();
  await syntheticPool.toggleRedeeming();
  await doppleX.mint(minter.address, toWei("1000000"));
  await doppleX.mint(owner.address, toWei("1000000"));
  await approveAll();
  await doppleX.setTransferLimit(ethers.constants.MaxUint256);
};

const mintSynth = async (amount, tcr) => {
  if (tcr.eq(0)) {
    const _doppleXAmount = toWei("200");
    const _synthOutMin = 0;

    await syntheticPool
      .connect(minter)
      .mintAlgorithmicSynth(_doppleXAmount, _synthOutMin);
  } else if (tcr.gte(toWei("1"))) {
    const _collateralAmount = toWei((100 * parseInt(amount)).toString());
    const _synthOutMin = 0;

    await syntheticPool
      .connect(minter)
      .mint1t1Synth(_collateralAmount, _synthOutMin);
  } else {
    const _collateralAmount = toWei("50");
    const _doppleXAmount = toWei("100");
    const _synthOutMin = 0;

    await syntheticPool
      .connect(minter)
      .mintFractionalSynth(_collateralAmount, _doppleXAmount, _synthOutMin);
  }
};

const approveAll = async () => {
  await doppleX
    .connect(minter)
    .approve(syntheticPool.address, ethers.constants.MaxUint256);
  await synth
    .connect(minter)
    .approve(syntheticPool.address, ethers.constants.MaxUint256);
  await usdc
    .connect(minter)
    .approve(syntheticPool.address, ethers.constants.MaxUint256);
};
