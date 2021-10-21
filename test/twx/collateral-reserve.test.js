const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const {
  deployContract,
  deployProxy,
  currentTime,
  toWei,
  fromWei,
  toPercent,
} = require("../utils");

const ADDRESS_ZERO = ethers.constants.AddressZero;
const BIG_ZERO = ethers.constants.Zero;
const BIG_ONE = ethers.constants.One;

// * ROLES
const MAINTAINER = ethers.utils.id("MAINTAINER");
const RATIO_SETTER = ethers.utils.id("RATIO_SETTER");
const POOL = ethers.utils.id("POOL");
const PAUSER = ethers.utils.id("PAUSER");
const MINTER = ethers.utils.id("MINTER");

const HALF_ETHER = toWei("0.5");
const ONE_ETHER = toWei("1");
const MILLION_ETHER = toWei("1000000");

describe("Collateral Reserve", async () => {
  // * MAIN CONTRACTS
  let collateralReserve, pidController, reserveTracker, syntheticPool;

  // * ORACLES
  let dopxOracle, synthOracle, usdcOracle;

  // * PAIR CONTRACTS
  let pairShareUsdc, pairShareBusd;

  // * ERC20 COIN CONTRACTS
  let usdc, busd, dopx, synth;

  // * DEFAULT
  // * signers 0 owner
  // * signers 1 feeCollector

  const deployAll = async () => {
    const [owner, minter] = await ethers.getSigners();

    // * deploy Synth
    [synth] = await deployProxy("Synth", [
      owner.address,
      "Synth kAPPL",
      "kAPPL",
    ]);

    // * deploy synth oracle
    synthOracle = await deployContract("MockPairOracle", [ONE_ETHER]);
    await synth.setOracle(synthOracle.address);

    // * Mock USDC
    usdc = await deployContract("MockWithName", [
      MILLION_ETHER,
      "USDC",
      "USDC",
    ]);
    usdcOracle = await deployContract("MockPairOracle", [ONE_ETHER]);

    // * Mock BUSD
    busd = await deployContract("MockWithName", [
      MILLION_ETHER,
      "BUSD",
      "BUSD",
    ]);

    // * deploy dopx
    [dopx] = await deployProxy("DoppleX", [owner.address]);

    // * mock dopx-usdc  pair
    dopxPair = await deployContract("MockPairV2", [
      dopx.address,
      usdc.address,
      "1000",
      "500",
    ]);

    // * deploy dopx oracle
    dopxOracle = await deployContract("MockPairOracle", [HALF_ETHER]);

    // * Mock DOPX-USDC
    pairShareUsdc = await deployContract("MockPair", [
      dopx.address,
      usdc.address,
      ONE_ETHER,
      HALF_ETHER,
    ]);

    // * Mock BUSD-DOPX
    pairShareBusd = await deployContract("MockPair", [
      busd.address,
      dopx.address,
      HALF_ETHER,
      ONE_ETHER,
    ]);

    // * Reserver Tracker
    [reserveTracker] = await deployProxy("ReserveTracker", [dopx.address]);
    // deploy CollateralReserve
    [collateralReserve] = await deployProxy("CollateralReserve", [], {
      kind: "transparent",
      initializer: false,
    });

    // * deploy PIDController
    [pidController] = await deployProxy("PIDController", [
      collateralReserve.address,
      dopx.address,
      reserveTracker.address,
      synthOracle.address,
    ]);

    // * deploy syntheticPool
    [syntheticPool] = await deployProxy("SyntheticPool", [
      collateralReserve.address,
      usdc.address,
      synth.address,
      synthOracle.address,
      dopx.address,
      owner.address,
    ]);

    // * grant role
    await dopx.connect(owner).grantRole(MINTER, collateralReserve.address);
    expect(await dopx.hasRole(MINTER, collateralReserve.address));

    // * approve
    await dopx
      .connect(minter)
      .approve(collateralReserve.address, ethers.constants.MaxUint256);
  };

  const setPrice = (oracle = synthOracle, amount) => oracle.mock(toWei(amount));

  const setReserves = (pair = pairShareUsdc, r0, r1) =>
    pair.setReserves(toWei(r0), toWei(r1));

  const mockTGSV = async (tgsv) => {
    const [owner, , minter] = await ethers.getSigners();

    // * add minter
    await synth.connect(owner).grantRole(MINTER, minter.address);

    // * add Synth
    await collateralReserve.addSynth(synth.address);
    await synth.connect(minter).mint(collateralReserve.address, tgsv);
  };

  const mockGCV = async (gcv) => {
    const [owner] = await ethers.getSigners();

    // * mint
    await usdc.connect(owner).mint(collateralReserve.address, gcv);
  };

  const mockECR = async (gcv, tgsv) => {
    // * mock tgsv
    await mockTGSV(tgsv);

    // * mock gcv
    await mockGCV(gcv);
  };

  const allBalanceOf = async (_user) => {
    const [usdcBalance, doppleXBalance, synthBalance] = await Promise.all([
      usdc.balanceOf(_user.address),
      dopx.balanceOf(_user.address),
      synth.balanceOf(_user.address),
    ]);
    return {
      usdc: fromWei(usdcBalance),
      dopx: fromWei(doppleXBalance),
      synth: fromWei(synthBalance),
    };
  };

  beforeEach(async () => {
    await deployAll();
    const [owner, feeCollector] = await ethers.getSigners();

    // * Manual initialize collateralReserve
    await collateralReserve.initialize(
      owner.address,
      pidController.address,
      dopx.address,
      dopxOracle.address,
      feeCollector.address
    );

    // * add collateral oracle
    await collateralReserve.addOracle(usdcOracle.address);

    // * add collateral address
    await collateralReserve.addCollateralAddress(
      usdc.address,
      usdcOracle.address
    );

    // * add share pairs
    await reserveTracker.connect(owner).addSharePair(pairShareUsdc.address);
    await reserveTracker.connect(owner).addSharePair(pairShareBusd.address);
  });

  it("Deployment should assign with initialize variable in contract correctly...", async () => {
    const [owner, feeCollector] = await ethers.getSigners();

    //  * MAINTAINER = owner
    expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
      .true;
    expect(await collateralReserve.getRoleMemberCount(MAINTAINER)).to.eq(
      BIG_ONE
    );

    // * RATIO_SETTER = pidController
    expect(await collateralReserve.hasRole(RATIO_SETTER, pidController.address))
      .to.be.true;
    expect(await collateralReserve.getRoleMemberCount(RATIO_SETTER)).to.eq(
      BIG_ONE
    );

    expect(await collateralReserve.pidController()).to.eq(
      pidController.address
    );
    expect(await collateralReserve.feeCollector()).to.eq(feeCollector.address);

    // * ratioDelta = 0.25%
    expect(await collateralReserve.ratioDelta()).to.eq(
      toWei(toPercent("0.25"))
    );

    // * bonusRate = 0.75%
    expect(await collateralReserve.bonusRate()).to.equal(
      toWei(toPercent("0.75"))
    );

    // * refreshCooldown = 0
    expect(await collateralReserve.refreshCooldown()).to.equal(toWei("0"));

    // * recallteralizePaused =  true
    expect(await collateralReserve.recollateralizePaused()).to.be.true;

    // * buybackPause = true
    expect(await collateralReserve.buyBackPaused()).to.be.true;

    // * investCollateralRatio = 70%
    expect(await collateralReserve.investCollateralRatio()).to.equal(
      toWei(toPercent("70"))
    );

    // * MAX_FEE = 5%
    expect(await collateralReserve.MAX_FEE()).to.equal(toWei(toPercent("5")));

    // * buyBackFee = 0%
    expect(await collateralReserve.buybackFee()).to.eq(BIG_ZERO);

    // * recollatFee = 0%
    expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);
    // TODO: Check more
  });

  it("able to add PAUSER role", async () => {
    const [owner, pauser] = await ethers.getSigners();
    //pauser
    expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(BIG_ZERO);
    await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);
    expect(await collateralReserve.hasRole(PAUSER, pauser.address)).to.be.true;
    expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(BIG_ONE);
  });

  it("able to get share price $0.5", async () => {
    const _price = await collateralReserve.getSharePrice();
    expect(_price).to.eq(HALF_ETHER);
  });

  describe("# Check Numbers", () => {
    describe("## `globalCollateralValue`", () => {
      it("is able to get 'globalCollateralValue'", async () => {
        await expect(collateralReserve.globalCollateralValue()).to.not.reverted;
      });

      it("should mock globalCollateralValue to ZERO", async () => {
        expect(await collateralReserve.globalCollateralValue()).to.eq(BIG_ZERO);
      });

      it("should mock globalCollateralValue to 50%", async () => {
        const [owner] = await ethers.getSigners();

        // mint
        await usdc.connect(owner).mint(collateralReserve.address, HALF_ETHER);

        expect(await collateralReserve.globalCollateralValue()).to.eq(
          toWei(toPercent("50"))
        );
      });

      it("should mock globalCollateralValue to 100%", async () => {
        const [owner] = await ethers.getSigners();

        // mint
        await usdc.connect(owner).mint(collateralReserve.address, ONE_ETHER);

        expect(await collateralReserve.globalCollateralValue()).to.eq(
          toWei(toPercent("100"))
        );
      });

      it("should check limit globalCollateralValue do not exceed 100%");
    });

    describe("## `totalGlobalSynthValue`", () => {
      it("should be zero if no synth totalSupply", async () => {
        // add Synth
        await collateralReserve.addSynth(synth.address);
        expect(await synth.balanceOf(collateralReserve.address)).to.eq(
          BIG_ZERO
        );
        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(BIG_ZERO);
      });

      it("is able to get 'totalGlobalSynthValue'", async () => {
        await expect(collateralReserve.totalGlobalSynthValue()).to.not.reverted;
      });

      it("should mock totalGlobalSynthValue to ZERO if synth price is zero", async () => {
        const [owner, minter] = await ethers.getSigners();
        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("10000"));

        await setPrice(synthOracle, 0);

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(BIG_ZERO);
      });

      it("should mock totalGlobalSynthValue to 10K", async () => {
        const [owner, minter] = await ethers.getSigners();
        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("10000"));

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("10000")
        );
      });

      it("should mock totalGlobalSynthValue to 1M", async () => {
        const [owner, minter] = await ethers.getSigners();

        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // set token cap
        await synth.connect(owner).setTokenCap(toWei("1000000"));

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("1000000"));

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("1000000")
        );
      });

      it("should mock totalGlobalSynthValue to 100M", async () => {
        const [owner, minter] = await ethers.getSigners();

        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // set token cap
        await synth.connect(owner).setTokenCap(toWei("100000000"));

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("100000000"));

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("100000000")
        );
      });

      it("should be ZERO if synthArray are empty", async () => {
        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(BIG_ZERO);
      });

      it("should be ZERO if synths totalSupply are ZERO", async () => {
        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(BIG_ZERO);
      });

      it("should be ZERO if synths price are $0", async () => {
        const [owner, minter] = await ethers.getSigners();

        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("1000"));

        await setPrice(synthOracle, 0);

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("0")
        );
      });

      it("should be 5k with 1 synth on synth 5$ totalSupply 1000", async () => {
        const [owner, minter] = await ethers.getSigners();

        await setPrice(synthOracle, 5);
        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("1000"));

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("5000")
        );
      });

      it("should be 10k with 1 synth on synth 0.1$ totalSupply 100k", async () => {
        const [owner, minter] = await ethers.getSigners();

        // mock synth oracles
        await setPrice(synthOracle, 0.1);
        // add Synth
        await collateralReserve.addSynth(synth.address);

        // set token cap
        await synth.connect(owner).setTokenCap(toWei("100000"));

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("100000"));

        expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
          toWei("10000")
        );
      });

      // for Kelly
      it("should be 25k with 2 synths on synth 5$ and 10$, ts 1000 and 2000");
    });

    describe("## `excessCollateralBalance`", () => {
      it("should be excessCollateralBalance correctly", async () => {
        // * ECR 1000%
        await mockECR(toWei("100"), toWei("10"));

        await setPrice(usdcOracle, 1);
        await setPrice(dopxOracle, 1);
        await setPrice(synthOracle, 1);

        const max = await collateralReserve.excessCollateralBalance(
          usdc.address
        );
        const maxExpected = toWei("90"); // 100 - 10;
        expect(max).to.equal(maxExpected);
      });

      it("should be excessCollateralBalance and getMaxBuybackShare correctly", async () => {
        // * TCR 100%
        await collateralReserve.setGlobalCollateralRatio(
          toWei(toPercent("100"))
        );

        // * ECR 1000%
        await mockECR(toWei("10000"), toWei("10"));
        // in value 1000/100
        // excessValue = 1000-100 = 900

        await setPrice(usdcOracle, "0.1");
        await setPrice(dopxOracle, "10");
        await setPrice(synthOracle, "10");

        const excess = await collateralReserve.excessCollateralBalance(
          usdc.address
        );

        // $900 = 9000 usdc
        expect(excess).to.equal(toWei("9000"));

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);

        // $900 = 90 dopx
        expect(max).to.equal(toWei("90"));
      });

      it("should be excessCollateralBalance and getMaxBuybackShare correctly", async () => {
        // * TCR 0%
        await collateralReserve.setGlobalCollateralRatio(toWei(toPercent("0")));

        // * ECR 1000%
        await mockECR(toWei("10000"), toWei("10"));
        // excessBalance = 10000
        // excessValue = 1000

        await setPrice(usdcOracle, "0.1");
        await setPrice(dopxOracle, "10");
        await setPrice(synthOracle, "10");

        const excess = await collateralReserve.excessCollateralBalance(
          usdc.address
        );

        // $1000 = 10000 usdc
        expect(excess).to.equal(toWei("10000"));

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);

        // $1000 = 100 dopx
        expect(max).to.equal(toWei("100"));
      });
    });

    describe("## `getMaxBuybackShare`", () => {
      it("should be getMaxBuybackShare correctly", async () => {
        // * ECR 1000%
        await mockECR(toWei("100"), toWei("10"));

        await setPrice(usdcOracle, 1);
        await setPrice(dopxOracle, 1);

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);
        const maxExpected = toWei("90"); // 100 - 10;
        expect(max).to.equal(maxExpected);
      });

      it("should be getMaxBuybackShare with $10/usdc, $1/dopx, $1/synth", async () => {
        // * ECR 1000%
        await mockECR(toWei("100"), toWei("10"));

        await setPrice(usdcOracle, 10);
        await setPrice(dopxOracle, 1);
        await setPrice(synthOracle, 1);

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);
        const maxExpected = toWei("990"); // 100*10 - 10;
        expect(max).to.equal(maxExpected);
      });

      it("should be getMaxBuybackShare with $10/usdc, $1/dopx, $1/synth", async () => {
        // * ECR 1000%
        await mockECR(toWei("1000"), toWei("10"));

        await setPrice(usdcOracle, "0.1");
        await setPrice(dopxOracle, 1);
        await setPrice(synthOracle, 1);

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);
        const maxExpected = toWei("90"); // 1000*0.1 - 10;
        expect(max).to.equal(maxExpected);
      });

      it("should be getMaxBuybackShare with $1/usdc, $1/dopx, $0.1/synth", async () => {
        // * ECR 1000%
        await mockECR(toWei("1000"), toWei("10"));

        await setPrice(usdcOracle, "1");
        await setPrice(dopxOracle, "1");
        await setPrice(synthOracle, "0.1");

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);
        const maxExpected = toWei("999"); // 1000 - 10*0.1;
        expect(max).to.equal(maxExpected);
      });

      it("should be getMaxBuybackShare with $1/usdc, $0.1/dopx, $1/synth", async () => {
        // * ECR 1000%
        await mockECR(toWei("1000"), toWei("10"));
        await setPrice(usdcOracle, "1");
        await setPrice(dopxOracle, "0.1");
        await setPrice(synthOracle, "1");

        const max = await collateralReserve.getMaxBuybackShare(usdc.address);

        // 1000*1 - 10*1 = 990
        // $0.1:1dopx
        // $990:9900dopx
        // ( 990*1 ) / 0.1 = 9900
        expect(max).to.equal(toWei("9900"));
      });

      describe("### `Fee`", () => {
        it("should be Fee 1% getMaxBuybackShare with $1/usdc, $0.1/dopx, $1/synth", async () => {
          // * ECR 1000%
          await mockECR(toWei("1000"), toWei("900"));

          await collateralReserve.setBuybackFee(toWei(toPercent("1")));
          await setPrice(usdcOracle, "1");
          await setPrice(dopxOracle, "0.1");
          await setPrice(synthOracle, "1");

          // 1000*1 - 900*1 = 100 + 1% = 101
          // $0.1:1dopx
          // $100: (101/0.1) = 1010
          expect(
            await collateralReserve.getMaxBuybackShare(usdc.address)
          ).to.closeTo(toWei("1010"), toWei("1"));
        });

        it("should be Fee 1% getMaxBuybackShare with $1/usdc, $0.1/dopx, $1/synth", async () => {
          const [owner, user1] = await ethers.getSigners();

          // * grant role PAUSER
          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, owner.address);
          await collateralReserve.connect(owner).toggleBuyBack();

          // * grant role MINTER
          await dopx.grantRole(MINTER, owner.address);
          await dopx.connect(owner).mint(user1.address, toWei("10000"));

          // * ECR 1000%
          await mockECR(toWei("1000"), toWei("900"));

          await collateralReserve.setBuybackFee(toWei(toPercent("1")));
          await setPrice(usdcOracle, "1");
          await setPrice(dopxOracle, "0.1");
          await setPrice(synthOracle, "1");

          expect(
            await collateralReserve.excessCollateralBalance(usdc.address)
          ).to.equal(toWei("100"));

          expect(
            await collateralReserve.getMaxBuybackShare(usdc.address)
          ).to.closeTo(toWei("1010"), toWei("1"));

          // 1000*1 - 900*1 = 100 + 1% = 101
          // $0.1:1dopx
          // $100: (101/0.1) = 1010
          // expect(fromWei(max).toString()).to.equal("1010.0");

          // ** try buyback

          await collateralReserve
            .connect(user1)
            .buyBackShare(toWei("1000"), toWei("0"), usdc.address);

          expect(await collateralReserve.totalGlobalSynthValue()).to.equal(
            toWei("900")
          );

          expect(await collateralReserve.globalCollateralValue()).to.equal(
            toWei("900")
          );
        });
      });
    });

    describe("## `getECR`", () => {
      it("should be 0 when no collateral added", async () => {
        const [owner, minter] = await ethers.getSigners();

        // add Synth
        await collateralReserve.addSynth(synth.address);

        // add minter
        await synth.connect(owner).grantRole(MINTER, minter.address);

        // mint
        await synth
          .connect(minter)
          .mint(collateralReserve.address, toWei("10000"));

        expect(await collateralReserve.getECR()).to.eq(BIG_ZERO);
      });

      it("should be 20% if gcv=20, tgsv=100", async () => {
        const _gcv = toWei("20");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("20")));
      });

      it("should be 80% if gcv=80, tgsv=100", async () => {
        const _gcv = toWei("80");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));
      });

      it("should be 100% if gcv=100, tgsv=100", async () => {
        const _gcv = toWei("100");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("100")));
      });

      it("should be 200% if gcv=200, tgsv=100", async () => {
        const _gcv = toWei("200");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("200")));
      });

      it("should be 1000% if gcv=1000, tgsv=100", async () => {
        const _gcv = toWei("1000");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(
          toWei(toPercent("1000"))
        );
      });

      it("should be 80% and not change after share price goes up", async () => {
        // * ECR 80%
        const _gcv = toWei("80");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

        // * increase share price
        await setPrice(dopxOracle, 0.8);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));
      });

      it("should be 80% and not change after share price goes down", async () => {
        // * ECR 80%
        const _gcv = toWei("80");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);
        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

        // * decrease share price
        await setPrice(dopxOracle, 0.2);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));
      });

      it("should be 100% then decrease to 80% after USDC price goes down", async () => {
        // * ECR 100%
        const _gcv = toWei("100");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("100")));

        // * decrease USDC price
        await setPrice(usdcOracle, 0.8);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));
      });

      it("should be 100% then increase to 120% after USDC price goes up", async () => {
        // * ECR 100%
        const _gcv = toWei("100");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("100")));

        // * increase USDC price
        await setPrice(usdcOracle, 1.2);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("120")));
      });

      it("should be 100% then decrease to 80% after Synth prices goes up to 1.25", async () => {
        // * ECR 100%
        const _gcv = toWei("100");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("100")));

        // * increase price
        await setPrice(synthOracle, 1.25);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));
      });

      it("should be 100% then increase to 200% after Synth prices goes down to 0.5", async () => {
        // * ECR 100%
        const _gcv = toWei("100");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("100")));

        // * decrease Synth price
        await setPrice(synthOracle, 0.5);

        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("200")));
      });

      describe("### with TCR 100%", () => {
        beforeEach(async () => {
          const _tcr = toWei(toPercent("100"));
          await collateralReserve.setGlobalCollateralRatio(_tcr);
          expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);
        });

        it("ECR should be 80% then increase to 100% after someone call MAX `recollateralizeShare`", async () => {
          const [owner, pauser, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("80"));
          const _expectedECR = toWei(toPercent("100"));

          const _gcv = toWei("80");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleRecollateralize();

          await usdc
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await usdc.connect(owner).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .recollateralizeShare(usdc.address, toWei("20"), BIG_ZERO);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 80% then increase to 90% after someone call `recollateralizeShare` with small amount", async () => {
          const [owner, pauser, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("80"));
          const _expectedECR = toWei(toPercent("90"));

          const _gcv = toWei("80");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleRecollateralize();

          await usdc
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await usdc.connect(owner).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .recollateralizeShare(usdc.address, toWei("10"), BIG_ZERO);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 150% then decrease to 125% after someone call MAX `buyBackShare`", async () => {
          const [owner, pauser, minter, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("150"));
          const _expectedECR = toWei(toPercent("125"));

          const _gcv = toWei("150");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleBuyBack();

          await dopx
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await dopx.connect(owner).grantRole(MINTER, minter.address);
          await dopx.connect(minter).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .buyBackShare(toWei("50"), BIG_ZERO, usdc.address);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 150% then decrease to 130% after someone call `buyBackShare` with small amount", async () => {
          const [owner, pauser, minter, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("150"));
          const _expectedECR = toWei(toPercent("130"));

          const _gcv = toWei("150");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleBuyBack();

          await dopx
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await dopx.connect(owner).grantRole(MINTER, minter.address);
          await dopx.connect(minter).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .buyBackShare(toWei("40"), BIG_ZERO, usdc.address);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });
      });

      describe("### with TCR 90%", () => {
        beforeEach(async () => {
          const _tcr = toWei(toPercent("90"));
          await collateralReserve.setGlobalCollateralRatio(_tcr);
          expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);
        });
        it("should be 80% then increase to 90% after someone call MAX `recollateralizeShare`", async () => {
          const [owner, pauser, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("80"));
          const _expectedECR = toWei(toPercent("90"));

          const _gcv = toWei("80");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleRecollateralize();

          await usdc
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await usdc.connect(owner).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .recollateralizeShare(usdc.address, toWei("10"), BIG_ZERO);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 10% then increase to 30% after someone call `recollateralizeShare` with small amount", async () => {
          const [owner, pauser, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("10"));
          const _expectedECR = toWei(toPercent("30"));

          const _gcv = toWei("10");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleRecollateralize();

          await usdc
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await usdc.connect(owner).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .recollateralizeShare(usdc.address, toWei("20"), BIG_ZERO);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 150% then decrease to 120% after someone call MAX `buyBackShare`", async () => {
          const [owner, pauser, minter, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("150"));
          const _expectedECR = toWei(toPercent("120"));

          const _gcv = toWei("150");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleBuyBack();

          await dopx
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await dopx.connect(owner).grantRole(MINTER, minter.address);
          await dopx.connect(minter).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .buyBackShare(toWei("60"), BIG_ZERO, usdc.address);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });

        it("should be 150% then decrease to 130% after someone call `buyBackShare` with small amount", async () => {
          const [owner, pauser, minter, user1] = await ethers.getSigners();
          const _ECR = toWei(toPercent("150"));
          const _expectedECR = toWei(toPercent("130"));

          const _gcv = toWei("150");
          const _tgsv = toWei("100");
          await mockECR(_gcv, _tgsv);

          expect(await collateralReserve.getECR()).to.eq(_ECR);

          await collateralReserve
            .connect(owner)
            .grantRole(PAUSER, pauser.address);

          await collateralReserve.connect(pauser).toggleBuyBack();

          await dopx
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);

          await dopx.connect(owner).grantRole(MINTER, minter.address);
          await dopx.connect(minter).mint(user1.address, toWei("100000"));

          await collateralReserve
            .connect(user1)
            .buyBackShare(toWei("40"), BIG_ZERO, usdc.address);

          expect(await collateralReserve.getECR()).to.eq(_expectedECR);
        });
      });
    });

    describe("## `getCollateralTokenValue`", () => {
      it("should get ZERO which no USDC", async () => {
        expect(
          await collateralReserve.getCollateralTokenValue(usdc.address)
        ).to.eq(BIG_ZERO);
      });

      it("should get 50 USDC which 50 USDC in collateralReserve", async () => {
        const [owner] = await ethers.getSigners();
        await usdc.connect(owner).mint(collateralReserve.address, toWei("50"));
        expect(
          await collateralReserve.getCollateralTokenValue(usdc.address)
        ).to.eq(toWei("50"));

        // * update collateral price (current price is $1/USDC)
        await setPrice(usdcOracle, 0.5);

        expect(
          await collateralReserve.getCollateralTokenValue(usdc.address)
        ).to.eq(toWei("50"));
      });
    });

    describe("## `excessCollateralBalance`", () => {
      it("should be zero if TCR > ECR", async () => {
        // * TCR 100%
        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("100"))
        );

        // * ECR 80%
        const _gcv = toWei("80");
        const _tgsv = toWei("100");
        await mockECR(_gcv, _tgsv);
        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

        expect(
          await collateralReserve.excessCollateralBalance(usdc.address)
        ).to.eq(BIG_ZERO);
      });

      it("should be 1m if TCR=80%, ECR=60% gcv=200k");
      it("should be 500k if TCR=80%, ECR=60% gcv=100k");
      it("should be 0 if TCR=60%, ECR=60% gcv=100k", async () => {
        // * TCR 60%
        await collateralReserve.setGlobalCollateralRatio(
          toWei(toPercent("60"))
        );
        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("60"))
        );

        // * ECR 60%
        const _gcv = toWei("600");
        const _tgsv = toWei("1000");
        await mockECR(_gcv, _tgsv);
        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("60")));

        expect(
          await collateralReserve.excessCollateralBalance(usdc.address)
        ).to.eq(BIG_ZERO);
      });

      it("should be 0 if TCR=60%, ECR=60% gcv=200k", async () => {
        // * TCR 60%
        await collateralReserve.setGlobalCollateralRatio(
          toWei(toPercent("60"))
        );
        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("60"))
        );

        // * ECR 60%
        const _gcv = toWei("600000");
        const _tgsv = toWei("1000000");
        await mockECR(_gcv, _tgsv);
        expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("60")));

        expect(
          await collateralReserve.excessCollateralBalance(usdc.address)
        ).to.eq(BIG_ZERO);
      });
      it("should be 1m if TCR=100%, ECR=60% gcv=40k");
    });

    describe("## `recollateralizeAmount`", () => {
      describe("### TCR < ECR", async () => {
        it("collateralNeeded should be ZERO , tcr= 20%, ecr =60%, gcv=200k, tgsv=1M", async () => {
          const [owner] = await ethers.getSigners();

          // * TCR = 20%
          await collateralReserve
            .connect(owner)
            .setGlobalCollateralRatio(toWei(toPercent("20")));
          expect(await collateralReserve.globalCollateralRatio()).to.eq(
            toWei(toPercent("20"))
          );

          // * ECR = 60%
          const _gcv = toWei("600000");
          const _tgsv = toWei("1000000");
          await mockECR(_gcv, _tgsv);
          expect(await collateralReserve.getECR()).to.eq(
            toWei(toPercent("60"))
          );

          // * collateralNeeded
          expect(
            await collateralReserve.recollateralizeAmount(usdc.address)
          ).to.eq(BIG_ZERO);
        });
      });

      describe("### TCR = ECR", async () => {
        it("collateralNeeded should be ZERO , tcr= 20%, ecr =20%, gcv=200k, tgsv=1M", async () => {
          const [owner] = await ethers.getSigners();

          // * TCR = 20%
          await collateralReserve
            .connect(owner)
            .setGlobalCollateralRatio(toWei(toPercent("20")));
          expect(await collateralReserve.globalCollateralRatio()).to.eq(
            toWei(toPercent("20"))
          );

          // * ECR = 20%
          const _gcv = toWei("200000");
          const _tgsv = toWei("1000000");
          await mockECR(_gcv, _tgsv);
          expect(await collateralReserve.getECR()).to.eq(
            toWei(toPercent("20"))
          );

          // * collateralNeeded
          expect(
            await collateralReserve.recollateralizeAmount(usdc.address)
          ).to.eq(BIG_ZERO);
        });
      });

      describe("### TCR > ECR", async () => {
        it("should be reverted with 'SafeMath: division by zero' , tcr = 100% , ecr = 0, gcv = 0, tgsv = 0", async () => {
          // * tgsv = 0
          expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
            BIG_ZERO
          );

          // * gcv = 0
          expect(await collateralReserve.globalCollateralValue()).to.eq(
            BIG_ZERO
          );

          // * collateralNeeded
          await expect(
            collateralReserve.recollateralizeAmount(usdc.address)
          ).to.be.revertedWith("SafeMath: division by zero");
        });

        it("collateralNeeded should be 1M if, tgsv = 1M, ecr = 0, gcv = 0, tcr = 100%", async () => {
          // * tgsv = 1M
          await mockTGSV(toWei("1000000"));
          expect(await collateralReserve.totalGlobalSynthValue()).to.eq(
            toWei("1000000")
          );

          // * gcv = 0
          expect(await collateralReserve.globalCollateralValue()).to.eq(
            BIG_ZERO
          );

          // * collateralNeeded
          expect(
            await collateralReserve.recollateralizeAmount(usdc.address)
          ).to.eq(toWei("1000000"));
        });
      });
    });
  });

  describe("# Function buyBackShare with USDC", () => {
    it("should be revertedWith(`Buyback is paused`) if buyback is paused", async () => {
      const [user1] = await ethers.getSigners();

      expect(await collateralReserve.buyBackPaused()).to.be.true;

      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("100"), toWei("100"), usdc.address)
      ).to.be.revertedWith("Buyback is paused");
    });

    it("should be revertedWith(`No enough Share`)", async () => {
      const [owner, pauser, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();
      expect(await collateralReserve.buyBackPaused()).to.be.false;

      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("100"), toWei("100"), usdc.address)
      ).to.be.revertedWith("No enough Share");
    });

    it("should be revertedWith(`No excess collateral to buy back!`)", async () => {
      const [owner, pauser, minter, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // *TCR = 80%
      const _cr = toWei(toPercent("80"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_cr);

      //  * ECR = 80%
      const _gcv = toWei("80");
      const _tgsv = toWei("100");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(_cr);

      // * expect TCR <= ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("1000"));

      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("100"), toWei("100"), usdc.address)
      ).to.be.revertedWith("No excess collateral to buy back!");
    });

    it("should be revertedWith(`Buyback over excess balance`)", async () => {
      const [owner, pauser, minter, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("80000");
      const _tgsv = toWei("100000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("50000"), toWei("100"), usdc.address)
      ).to.be.revertedWith("Buyback over excess balance");
    });

    it(
      "should be revertedWith('Not enough available excess collateral token')"
    );

    it("should be revertedWith(`Slippage limit reached`)", async () => {
      const [owner, pauser, minter, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("400"), toWei("1000"), usdc.address)
      ).to.be.revertedWith("Slippage limit reached");
    });

    it("should be revertedWith(`Buyback over excess balance`) if the share price goes up", async () => {
      const [owner, pauser, minter, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * increase share price 0.5$ -> 1$
      await setPrice(dopxOracle, 1);

      // * excessCollateralBalance = 200
      // * supposed to buyBackShare 400 DOPX (0.5$/DOPX) before the price changed (1$/DOPX)
      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("400"), toWei("1000"), usdc.address)
      ).to.be.revertedWith("Buyback over excess balance");
    });

    it("should be revertedWith(`Slippage limit reached`) if the share price goes down", async () => {
      const [owner, pauser, minter, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * increase share price 0.5$ -> 0.1$
      await setPrice(dopxOracle, 0.1);

      // * excessCollateralBalance = 200
      // * supposed to buyBackShare 400 DOPX (0.5$/DOPX) before the price changed (0.1$/DOPX)
      await expect(
        collateralReserve
          .connect(user1)
          .buyBackShare(toWei("400"), toWei("1000"), usdc.address)
      ).to.be.revertedWith("Slippage limit reached");
    });

    it("should get excessCollateralBalance to be 0", async () => {
      const [owner, pauser, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // *TCR = 80%
      const _cr = toWei(toPercent("80"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_cr);

      //  * ECR = 80%
      const _gcv = toWei("80");
      const _tgsv = toWei("100");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(_cr);

      // * expect TCR <= ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      // * excessCollateralBalance = 0
      expect(
        await collateralReserve.excessCollateralBalance(usdc.address)
      ).to.eq(BIG_ZERO);
    });

    it("should get excessCollateralBalance to be 500k", async () => {
      const [owner, pauser, user1] = await ethers.getSigners();

      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 30%
      const _tcr = toWei(toPercent("30"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800000");
      const _tgsv = toWei("1000000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * excessCollateralBalance = 500k
      expect(
        await collateralReserve.excessCollateralBalance(usdc.address)
      ).to.eq(toWei("500000"));
    });

    it("should call Min `buyBackShare` which default fee", async () => {
      const [owner, feeCollector, pauser, minter, user1] =
        await ethers.getSigners();

      // * buyBackFee = 0%
      expect(await collateralReserve.buybackFee()).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * approve
      await dopx
        .connect(user1)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);

      await collateralReserve
        .connect(user1)
        .buyBackShare(toWei("1"), BIG_ZERO, usdc.address);

      // * burn 1 dopx from user1
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("49999"));

      // * transfer 0.5 USDC to user1
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("0.5"));

      // * transfer 0 USDC to feeCollector
      expect(await usdc.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });

    it("should call Max `buyBackShare` which default fee", async () => {
      const [owner, feeCollector, pauser, minter, user1] =
        await ethers.getSigners();

      // * buyBackFee = 0%
      expect(await collateralReserve.buybackFee()).to.eq(BIG_ZERO);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * approve
      await dopx
        .connect(user1)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);

      // * excessCollateralBalance = 200
      await collateralReserve
        .connect(user1)
        .buyBackShare(toWei("400"), BIG_ZERO, usdc.address);

      // * burn 400 dopx from user1
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("49600"));

      // * transfer 194 USDC to user1
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("200"));

      // * transfer 0 USDC to feeCollector
      expect(await usdc.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });

    it("should call Min `buyBackShare` which set fee to 3%", async () => {
      const [owner, feeCollector, pauser, minter, user1] =
        await ethers.getSigners();

      // * set buyBackFee = 3%
      const _buyBackFee = toWei(toPercent("3"));
      await collateralReserve.connect(owner).setBuybackFee(_buyBackFee);
      expect(await collateralReserve.buybackFee()).to.eq(_buyBackFee);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * approve
      await dopx
        .connect(user1)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);

      // * dopx balance
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("50000"));
      expect(await usdc.balanceOf(user1.address)).to.eq(BIG_ZERO);

      await collateralReserve
        .connect(user1)
        .buyBackShare(toWei("1"), BIG_ZERO, usdc.address);

      // * burn 1 dopx from user1
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("49999"));

      // * transfer 0.485 USDC to user1
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("0.485"));

      // * transfer 0.015 USDC to feeCollector
      expect(await usdc.balanceOf(feeCollector.address)).to.eq(toWei("0.015"));
    });

    it("should call Max `buyBackShare` which set fee to 3%", async () => {
      const [owner, feeCollector, pauser, minter, user1] =
        await ethers.getSigners();

      // * set buyBackFee = 3%
      const _buyBackFee = toWei(toPercent("3"));
      await collateralReserve.connect(owner).setBuybackFee(_buyBackFee);
      expect(await collateralReserve.buybackFee()).to.eq(_buyBackFee);

      // * grant role PAUSER
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);

      // * buyBackPaused = false
      await collateralReserve.connect(pauser).toggleBuyBack();

      expect(await collateralReserve.buyBackPaused()).to.be.false;

      // * TCR = 60%
      const _tcr = toWei(toPercent("60"));
      await collateralReserve.connect(owner).setGlobalCollateralRatio(_tcr);
      expect(await collateralReserve.globalCollateralRatio()).to.eq(_tcr);

      // * ECR = 80%
      const _gcv = toWei("800");
      const _tgsv = toWei("1000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("80")));

      // * expect TCR < ECR
      expect(await collateralReserve.globalCollateralRatio()).to.lt(
        await collateralReserve.getECR()
      );

      // * grant role MINTER
      await dopx.grantRole(MINTER, minter.address);

      // * transfer dopx
      await dopx.connect(minter).mint(user1.address, toWei("50000"));

      // * approve
      await dopx
        .connect(user1)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);

      // * dopx balance
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("50000"));
      expect(await usdc.balanceOf(user1.address)).to.eq(BIG_ZERO);

      // * excessCollateralBalance = 200
      await collateralReserve
        .connect(user1)
        .buyBackShare(toWei("400"), BIG_ZERO, usdc.address);

      // * burn 400 dopx from user1
      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("49600"));

      // * transfer 194 USDC to user1
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("194"));

      // * transfer 6 USDC to feeCollector
      expect(await usdc.balanceOf(feeCollector.address)).to.eq(toWei("6"));
    });
  });

  describe("# Function `recollateralizeShare`", () => {
    let user1;
    beforeEach(async () => {
      [owner, feeCollector, pauser, minter, user1] = await ethers.getSigners();
      // * TCR 100%
      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );
      // * ECR 90%
      const _gcv = toWei("9000");
      const _tgsv = toWei("10000");
      await mockECR(_gcv, _tgsv);
      expect(await collateralReserve.getECR()).to.eq(toWei(toPercent("90")));

      // * grant role PAUSER
      await collateralReserve.grantRole(PAUSER, pauser.address);

      // * mint
      await usdc.connect(owner).mint(user1.address, toWei("100000"));
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("100000"));

      // * recollateralizePaused = false
      await collateralReserve.connect(pauser).toggleRecollateralize();
      expect(await collateralReserve.recollateralizePaused()).to.be.false;

      // * approve
      await dopx
        .connect(owner)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);
      await usdc
        .connect(user1)
        .approve(collateralReserve.address, ethers.constants.MaxUint256);
    });

    it("should be revertedWith(`Recollateralize is paused`)", async () => {
      await collateralReserve.connect(pauser).toggleRecollateralize();
      expect(await collateralReserve.recollateralizePaused()).to.be.true;

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("100"), BIG_ZERO)
      ).to.be.revertedWith("Recollateralize is paused");
    });

    it("should be revertedWith(`insufficient collateral`)", async () => {
      // * TCR 80% TCR < ECR
      await collateralReserve.setGlobalCollateralRatio(toWei(toPercent("80")));

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("100"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should be revertedWith(`Request recollateralize over limit`)", async () => {
      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("100000000"), BIG_ZERO)
      ).to.be.revertedWith("Request recollateralize over limit");
    });

    it("should be revertedWith(`Slippage limit reached`)", async () => {
      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), toWei("2000"))
      ).to.be.revertedWith("Slippage limit reached");
    });

    it("should call Max `recollateralizeShare` with Price");

    it("should call Max `recollateralizeShare` with bonusRate 0.75%, recollatFee = 0 %", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 0%
      expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("2015"));

      // * fee = 0
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);

      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call Max `recollateralizeShare` with bonusRate 3%", async () => {
      // * bonusRate = 3%
      await collateralReserve.setBonusRate(toWei(toPercent("3")));
      expect(await collateralReserve.bonusRate()).to.eq(toWei(toPercent("3")));

      // * recollatFee = 0%
      expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("2060"));

      // * fee = 0
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);

      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call Max `recollateralizeShare` with default fee 0%", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 0%
      expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("2015"));

      // * fee = 0
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);

      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call Max `recollateralizeShare` which set fee to 1%", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 1%
      await collateralReserve.setRecollatFee(toWei(toPercent("1")));
      expect(await collateralReserve.recollatFee()).to.eq(
        toWei(toPercent("1"))
      );

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("1994.85"));

      // * fee = 1%
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(toWei("20.15"));

      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call Max `recollateralizeShare` which collat price go to $10", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 0%
      expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

      expect(await collateralReserve.globalCollateralRatio()).to.gt(
        await collateralReserve.getECR()
      );

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("9000")
      );
      //* mint 100000 beforeEach at mockECR
      expect(await usdc.balanceOf(user1.address)).to.eq(toWei("100000"));

      await setPrice(usdcOracle, 10);

      // * tcr < ecr since the price has changed 1$/USDC ->  10$/USDC
      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("100"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");

      const _balance = await allBalanceOf(user1);
      expect(_balance.dopx).to.eq("0.0");
      expect(_balance.usdc).to.eq("100000.0");

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call Max `recollateralizeShare` which set fee to 1%", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 1%
      await collateralReserve.setRecollatFee(toWei(toPercent("1")));
      expect(await collateralReserve.recollatFee()).to.eq(
        toWei(toPercent("1"))
      );

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("1000"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("1994.85"));

      // * fee = 1%
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(toWei("20.15"));

      expect(await collateralReserve.globalCollateralRatio()).to.lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");
    });

    it("should call min 0 `recollateralizeShare` with bonusRate 0.75%, recollatFee = 0 %", async () => {
      // * bonusRate = 0.75%
      expect(await collateralReserve.bonusRate()).to.eq(
        toWei(toPercent("0.75"))
      );
      // * recollatFee = 0%
      expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO);

      expect(await dopx.balanceOf(user1.address)).to.eq(toWei("1813.5"));

      // * fee = 0
      expect(await dopx.balanceOf(owner.address)).to.eq(BIG_ZERO);

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("900"), BIG_ZERO)
      ).to.be.revertedWith("Request recollateralize over limit");
    });

    it("should call min 0 `recollateralizeShare` with bonusRate 3%", async () => {
      const [owner] = await ethers.getSigners();
      const _bonusRate = toWei(toPercent("3"));
      await collateralReserve.connect(owner).setBonusRate(_bonusRate);

      expect(await collateralReserve.bonusRate()).to.eq(_bonusRate);
      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, BIG_ZERO, BIG_ZERO);

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("9000")
      );
      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });

    it("should call min 0 `recollateralizeShare` with default fee", async () => {
      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, BIG_ZERO, BIG_ZERO);

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("9000")
      );
      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });

    it("should call min 0 `recollateralizeShare` which set fee to 1%", async () => {
      const [owner] = await ethers.getSigners();
      const _recallatFee = toWei(toPercent("3"));
      await collateralReserve.connect(owner).setRecollatFee(_recallatFee);

      expect(await collateralReserve.recollatFee()).to.eq(_recallatFee);
      await collateralReserve
        .connect(user1)
        .recollateralizeShare(usdc.address, BIG_ZERO, BIG_ZERO);

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("9000")
      );
      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });

    it("should call min 0 `recollateralizeShare` which collat price go to $10", async () => {
      await setPrice(usdcOracle, 10);

      // * tcr < ecr since the price has changed 1$/USDC ->  10$/USDC
      expect(await collateralReserve.globalCollateralRatio()).lte(
        await collateralReserve.getECR()
      );

      await expect(
        collateralReserve
          .connect(user1)
          .recollateralizeShare(usdc.address, toWei("100"), BIG_ZERO)
      ).to.be.revertedWith("insufficient collateral");

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("9000")
      );
      expect(await dopx.balanceOf(user1.address)).to.eq(BIG_ZERO);
      expect(await dopx.balanceOf(feeCollector.address)).to.eq(BIG_ZERO);
    });
  });

  describe("# Function recollateralizeShare", () => {
    describe("## Max amount", () => {
      describe("### TCR 100% ECR 0%", async () => {
        beforeEach(async () => {
          const [owner, feeCollector, user1] = await ethers.getSigners();
          // * setFeeCollector
          await collateralReserve.setFeeCollector(feeCollector.address);

          // * TCR 100%
          await collateralReserve.setGlobalCollateralRatio(
            toWei(toPercent("100"))
          );

          // * mint
          await usdc.connect(owner).mint(user1.address, toWei("30000000"));
          expect(await usdc.balanceOf(user1.address)).to.eq(toWei("30000000"));

          // * recollateralizePaused = false
          await collateralReserve.grantRole(PAUSER, owner.address);
          await collateralReserve.connect(owner).toggleRecollateralize();
          expect(await collateralReserve.recollateralizePaused()).to.be.false;

          // * approve
          await usdc
            .connect(user1)
            .approve(collateralReserve.address, ethers.constants.MaxUint256);
        });

        describe("### ECR 0% With 0 collateral, 1 marketCap", async () => {
          beforeEach(async () => {
            // * ECR 0%
            await mockECR("0", toWei("1"));
            expect(await collateralReserve.getECR()).to.eq("0");
          });

          it("should call Max `recollateralizeShare` with bonusRate 0%, fee 0%", async () => {
            const [, , user1] = await ethers.getSigners();

            // * bonusRate = 0%
            // * recollatFee = 0%
            await collateralReserve.setBonusRate("0");
            expect(await collateralReserve.bonusRate()).to.eq(BIG_ZERO);
            expect(await collateralReserve.recollatFee()).to.eq(BIG_ZERO);

            const before = await allBalanceOf(user1);
            expect(before.dopx).to.equal("0.0");
            expect(before.usdc).to.equal("30000000.0");
            expect(
              await collateralReserve.recollateralizeAmount(usdc.address)
            ).to.eq(toWei("1"));

            await collateralReserve
              .connect(user1)
              .recollateralizeShare(usdc.address, toWei("1"), BIG_ZERO);

            const after = await allBalanceOf(user1);
            expect(after.dopx).to.equal("2.0");
            expect(after.usdc).to.equal("29999999.0");
            expect(await collateralReserve.getECR()).to.eq(
              toWei(toPercent("100"))
            );

            const crAfter = await allBalanceOf(collateralReserve);
            expect(crAfter.dopx).to.equal("0.0");
            expect(crAfter.usdc).to.equal("1.0");
          });

          it("should call Max `recollateralizeShare` with bonusRate 0%, fee 0.7%", async () => {
            const [, feeCollector, user1] = await ethers.getSigners();

            await collateralReserve.setBonusRate("0");
            await collateralReserve.setRecollatFee(toWei(toPercent("0.7")));
            await setPrice(usdcOracle, 1);
            await setPrice(dopxOracle, 1);

            const before = await allBalanceOf(user1);
            expect(before.dopx).to.equal("0.0");
            expect(before.usdc).to.equal("30000000.0");
            expect(
              await collateralReserve.recollateralizeAmount(usdc.address)
            ).to.eq(toWei("1"));

            await collateralReserve
              .connect(user1)
              .recollateralizeShare(usdc.address, toWei("1"), BIG_ZERO);

            const after = await allBalanceOf(user1);
            expect(after.dopx).to.equal("0.993");
            expect(after.usdc).to.equal("29999999.0");
            expect(await collateralReserve.getECR()).to.eq(
              toWei(toPercent("100"))
            );

            const crAfter = await allBalanceOf(collateralReserve);
            expect(crAfter.dopx).to.equal("0.0");
            expect(crAfter.usdc).to.equal("1.0");

            const afterFeeCollector = await allBalanceOf(feeCollector);
            expect(afterFeeCollector.dopx).to.equal("0.007");
          });

          it("should call Max `recollateralizeShare` with bonusRate 3%", async () => {
            const [, , user1] = await ethers.getSigners();

            await collateralReserve.setBonusRate(toWei(toPercent("3")));
            await setPrice(usdcOracle, 1);
            await setPrice(dopxOracle, 1);

            const before = await allBalanceOf(user1);
            expect(before.dopx).to.equal("0.0");
            expect(before.usdc).to.equal("30000000.0");
            expect(
              await collateralReserve.recollateralizeAmount(usdc.address)
            ).to.eq(toWei("1"));

            await collateralReserve
              .connect(user1)
              .recollateralizeShare(usdc.address, toWei("1"), BIG_ZERO);

            const after = await allBalanceOf(user1);
            expect(after.dopx).to.equal("1.03");
            expect(after.usdc).to.equal("29999999.0");
            expect(await collateralReserve.getECR()).to.eq(
              toWei(toPercent("100"))
            );

            const crAfter = await allBalanceOf(collateralReserve);
            expect(crAfter.dopx).to.equal("0.0");
            expect(crAfter.usdc).to.equal("1.0");
          });
        });

        describe("### ECR 0% With 0.000000000000000001 collateral, 30M marketCap", async () => {
          beforeEach(async () => {
            // * ECR 0%
            await mockECR("1", toWei("30000000"));
            expect(await collateralReserve.getECR()).to.eq("0");
          });

          it("should call Max `recollateralizeShare` with recollat bonus rate 0% fee 0.7%", async () => {
            const [, , user1] = await ethers.getSigners();

            await collateralReserve.setBonusRate("0");
            await collateralReserve.setRecollatFee(toWei(toPercent("0.7")));
            await setPrice(usdcOracle, 1);
            await setPrice(dopxOracle, 1);

            const before = await allBalanceOf(user1);
            expect(before.dopx).to.equal("0.0");
            expect(before.usdc).to.equal("30000000.0");

            const crBefore = await allBalanceOf(collateralReserve);
            expect(crBefore.dopx).to.equal("0.0");
            expect(crBefore.usdc).to.equal("0.000000000000000001");

            expect(
              await collateralReserve.recollateralizeAmount(usdc.address)
            ).to.eq(BigNumber.from("29999999999999999999999999"));

            await collateralReserve
              .connect(user1)
              .recollateralizeShare(
                usdc.address,
                BigNumber.from("29999999999999999999999999"),
                BIG_ZERO
              );

            const after = await allBalanceOf(user1);
            const calcFee = toWei("30000000")
              .sub(toWei("0.000000000000000001"))
              .mul(toWei(1).sub(toWei(toPercent("0.7"))))
              .div(toWei(1));
            expect(fromWei(calcFee)).to.equal("29789999.999999999999999999");
            expect(after.dopx).to.equal("29789999.999999999999999999");
            expect(after.usdc).to.equal("0.000000000000000001");

            expect(await collateralReserve.getECR()).to.eq(
              toWei(toPercent("100"))
            );

            const crAfter = await allBalanceOf(collateralReserve);
            expect(crAfter.dopx).to.equal("0.0");
            expect(crAfter.usdc).to.equal("30000000.0");
          });
        });
      });
    });
  });

  describe("# Vault", () => {
    let vToken, treasuryVaultVenus;
    // deploy vToken and vault then add vault
    beforeEach(async () => {
      const [owner] = await ethers.getSigners();
      // * Mock vToken
      vToken = await deployContract("MockVToken", [
        usdc.address,
        ethers.constants.AddressZero,
      ]);

      // * treasury vault venus
      [treasuryVaultVenus] = await deployProxy("TreasuryVaultVenus", [
        owner.address,
        usdc.address,
        collateralReserve.address,
        vToken.address,
      ]);

      // * add vault
      await collateralReserve.addVault(treasuryVaultVenus.address);
      expect(await collateralReserve.vaults(0)).to.be.equal(
        treasuryVaultVenus.address
      );
    });

    it("should call enterVault with correct amount", async () => {
      await usdc.mint(collateralReserve.address, toWei("100"));

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("100")
      );
      expect(await collateralReserve.investCollateralRatio()).to.be.equal(
        toWei(toPercent("70"))
      );

      await collateralReserve.enterVault("0");

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("30")
      );
      expect(await usdc.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("0")
      );
      expect(await vToken.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("70")
      );
      expect(await treasuryVaultVenus.vaultBalance()).to.be.equal(toWei("70"));
    });

    it("should call recallFromVault with correct amount", async () => {
      await usdc.mint(collateralReserve.address, toWei("100"));

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("100")
      );
      expect(await collateralReserve.investCollateralRatio()).to.be.equal(
        toWei(toPercent("70"))
      );
      await collateralReserve.enterVault("0");

      await collateralReserve.recallFromVault("0");

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("100")
      );
      expect(await usdc.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("0")
      );
      expect(await vToken.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("0")
      );
      expect(await treasuryVaultVenus.vaultBalance()).to.be.equal(toWei("0"));
    });

    it("should call rebalanceVault with correct amount", async () => {
      await usdc.mint(collateralReserve.address, toWei("100"));

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("100")
      );
      expect(await collateralReserve.investCollateralRatio()).to.be.equal(
        toWei(toPercent("70"))
      );

      await collateralReserve.enterVault("0");
      await usdc.mint(collateralReserve.address, toWei("100"));
      await collateralReserve.rebalanceVault("0");

      expect(await usdc.balanceOf(collateralReserve.address)).to.be.equal(
        toWei("60")
      );
      expect(await usdc.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("0")
      );
      expect(await vToken.balanceOf(treasuryVaultVenus.address)).to.be.equal(
        toWei("140")
      );
      expect(await treasuryVaultVenus.vaultBalance()).to.be.equal(toWei("140"));
    });

    it("should get globalCollateralValue after enterVault which no change", async () => {
      const [owner] = await ethers.getSigners();
      // mint
      await usdc.connect(owner).mint(collateralReserve.address, toWei("100"));

      // Before enterVault
      expect(await collateralReserve.globalCollateralValue()).to.eq(
        toWei("100")
      );
      await collateralReserve.enterVault("0");

      // after enterVault
      expect(await collateralReserve.globalCollateralValue()).to.eq(
        toWei("100")
      );
    });

    it("should get globalCollateralValue correctly if price of collateral changed", async () => {
      const [owner] = await ethers.getSigners();
      // mint
      await usdc.connect(owner).mint(collateralReserve.address, toWei("100"));

      // Before enterVault
      expect(await collateralReserve.globalCollateralValue()).to.eq(
        toWei("100")
      );
      await collateralReserve.enterVault("0");

      // ** price changed
      await setPrice(usdcOracle, 10);

      // after enterVault
      expect(await collateralReserve.globalCollateralValue()).to.eq(
        toWei("1000")
      );
    });

    it("should throw if get globalCollateralValue with no oracle of collateral token", async () => {
      const [owner, someone] = await ethers.getSigners();
      // mint
      await usdc.connect(owner).mint(collateralReserve.address, toWei("100"));

      // Before enterVault
      expect(await collateralReserve.globalCollateralValue()).to.eq(
        toWei("100")
      );
      await collateralReserve.enterVault("0");

      await collateralReserve.setOracleOf(usdc.address, someone.address);

      // after enterVault
      await expect(collateralReserve.globalCollateralValue()).to.be.reverted;
    });
  });

  describe("# Access control and Set functions", () => {
    it("only MAINTAINER is able to 'addPool'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve.connect(anotherAccount).addPool(syntheticPool.address)
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve.connect(owner).addPool(ADDRESS_ZERO)
      ).to.be.revertedWith("Zero address detected");

      await expect(
        collateralReserve.connect(owner).addPool(syntheticPool.address)
      )
        .to.emit(collateralReserve, "PoolAdded")
        .withArgs(syntheticPool.address);
      expect(await collateralReserve.synthPoolExist(syntheticPool.address)).to
        .be.true;
      expect(await collateralReserve.synthPoolArray(BIG_ZERO)).to.eq(
        syntheticPool.address
      );
      // POOL = pool
      expect(await collateralReserve.hasRole(POOL, syntheticPool.address)).to.be
        .true;
      expect(await collateralReserve.getRoleMemberCount(POOL)).to.eq(BIG_ONE);

      await expect(
        collateralReserve.connect(owner).addPool(syntheticPool.address)
      ).to.be.revertedWith("Address already exists");
    });

    it("only MAINTAINER is able to 'removePool'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();

      await expect(
        collateralReserve
          .connect(anotherAccount)
          .removePool(syntheticPool.address)
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve.connect(owner).removePool(ADDRESS_ZERO)
      ).to.be.revertedWith("Zero address detected");

      // add pool
      await expect(
        collateralReserve.connect(owner).addPool(syntheticPool.address)
      )
        .to.emit(collateralReserve, "PoolAdded")
        .withArgs(syntheticPool.address);
      expect(await collateralReserve.synthPoolExist(syntheticPool.address)).to
        .be.true;
      expect(await collateralReserve.synthPoolArray(BIG_ZERO)).to.eq(
        syntheticPool.address
      );
      // POOL = pool
      expect(await collateralReserve.hasRole(POOL, syntheticPool.address)).to.be
        .true;
      expect(await collateralReserve.getRoleMemberCount(POOL)).to.eq(BIG_ONE);

      // remove pool
      await expect(
        collateralReserve.connect(owner).removePool(syntheticPool.address)
      )
        .to.emit(collateralReserve, "PoolRemoved")
        .withArgs(syntheticPool.address);
      expect(await collateralReserve.synthPoolExist(syntheticPool.address)).to
        .be.false;
      expect(await collateralReserve.synthPoolArray(BIG_ZERO)).to.eq(
        ADDRESS_ZERO
      );
      expect(await collateralReserve.hasRole(POOL, syntheticPool.address)).to.be
        .false;
      expect(await collateralReserve.getRoleMemberCount(POOL)).to.eq(BIG_ZERO);
    });

    it("only MAINTAINER is able to 'rebalanceVault'", async () => {
      const [owner, user1] = await ethers.getSigners();

      expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
        .true;
      // await expect(collateralReserve.connect(owner).rebalanceVault(0)).to.not
      //   .reverted;

      expect(await collateralReserve.hasRole(MAINTAINER, user1.address)).to.be
        .false;
      await expect(collateralReserve.connect(user1).rebalanceVault(0)).to.be
        .reverted;
    });

    it("non MAINTAINER is not able to 'enterVault'", async () => {
      const [owner, user1, vault] = await ethers.getSigners();
      expect(await collateralReserve.hasRole(MAINTAINER, user1.address)).to.be
        .false;

      await expect(collateralReserve.connect(user1).enterVault(0)).to.be
        .reverted;
    });

    it("non MAINTAINER is not able to 'recallFromVault'", async () => {
      const [, user1] = await ethers.getSigners();
      expect(await collateralReserve.hasRole(MAINTAINER, user1.address)).to.be
        .false;

      await expect(collateralReserve.connect(user1).recallFromVault(0)).to.be
        .reverted;
    });

    it("only MAINTAINER is able to 'removeVault'", async () => {
      const [owner, user1, vault] = await ethers.getSigners();

      expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
        .true;

      await expect(
        collateralReserve.connect(user1).removeVault(ADDRESS_ZERO)
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve.connect(owner).removeVault(ADDRESS_ZERO)
      ).to.be.revertedWith("invalidAddress");

      await collateralReserve.connect(owner).addVault(vault.address);

      await expect(collateralReserve.connect(owner).removeVault(vault.address))
        .to.emit(collateralReserve, "VaultRemoved")
        .withArgs(vault.address);
      expect(await collateralReserve.vaults(0)).to.eq(ADDRESS_ZERO);
    });

    it("only MAINTAINER is able to 'addVault'", async () => {
      const [owner, user1, vault] = await ethers.getSigners();

      expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
        .true;

      await expect(
        collateralReserve.connect(user1).addVault(ADDRESS_ZERO)
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve.connect(owner).addVault(ADDRESS_ZERO)
      ).to.be.revertedWith("invalidAddress");

      await expect(collateralReserve.connect(owner).addVault(vault.address))
        .to.emit(collateralReserve, "VaultAdded")
        .withArgs(vault.address);
      expect(await collateralReserve.vaults(0)).to.eq(vault.address);
    });

    it("only RATIO_SETTER is able to 'stepDownTCR'", async () => {
      const [owner, ratio_setter, user1] = await ethers.getSigners();
      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      await collateralReserve
        .connect(owner)
        .grantRole(RATIO_SETTER, ratio_setter.address);

      await expect(collateralReserve.connect(ratio_setter).stepDownTCR()).to.not
        .reverted;
      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("99.75"))
      );
      await expect(
        collateralReserve.connect(user1).stepDownTCR()
      ).to.be.revertedWith("Sender is not a ratio setter");
    });

    it("only RATIO_SETTER is able to 'stepUpTCR'", async () => {
      const [owner, ratio_setter, user1] = await ethers.getSigners();

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );
      await collateralReserve
        .connect(owner)
        .grantRole(RATIO_SETTER, ratio_setter.address);

      await expect(collateralReserve.connect(ratio_setter).stepUpTCR()).to.not
        .reverted;

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("100"))
      );

      await expect(
        collateralReserve.connect(user1).stepUpTCR()
      ).to.be.revertedWith("Sender is not a ratio setter");
    });

    it("only MAINTAINER is able to 'setGlobalCollateralRatio'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve
          .connect(anotherAccount)
          .setGlobalCollateralRatio(toWei(toPercent("100")))
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve
          .connect(owner)
          .setGlobalCollateralRatio(toWei(toPercent("1000")))
      ).to.be.revertedWith("New ratio exceed bound");

      await collateralReserve
        .connect(owner)
        .setGlobalCollateralRatio(toWei(toPercent("100")));

      await expect(
        collateralReserve
          .connect(owner)
          .setGlobalCollateralRatio(toWei(toPercent("50")))
      )
        .to.emit(collateralReserve, "SetGlobalCollateralRatio")
        .withArgs(toWei(toPercent("50")));

      expect(await collateralReserve.globalCollateralRatio()).to.eq(
        toWei(toPercent("50"))
      );

      expect(await collateralReserve.lastCallTime()).to.gte(
        await currentTime()
      );
    });

    it("only RATIO_SETTER is able to 'setRatioDelta'", async () => {
      const [owner, ratio_setter, user1] = await ethers.getSigners();
      await collateralReserve
        .connect(owner)
        .grantRole(RATIO_SETTER, ratio_setter.address);

      await expect(
        collateralReserve
          .connect(ratio_setter)
          .setRatioDelta(toWei(toPercent("0.5")))
      ).to.not.reverted;
      await expect(
        collateralReserve.connect(user1).setRatioDelta(toWei(toPercent("0.5")))
      ).to.be.reverted;
    });

    it("only MAINTAINER is able to 'setBonusRate", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve.connect(anotherAccount).setBonusRate(BIG_ONE)
      ).to.be.reverted;

      await expect(collateralReserve.connect(owner).setBonusRate(BIG_ONE)).to
        .not.be.reverted;

      expect(await collateralReserve.connect(owner).bonusRate()).to.eq(BIG_ONE);
    });

    it("only MAINTAINER is able to 'setFeeCollector'", async () => {
      const [owner, account2, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve
          .connect(anotherAccount)
          .setFeeCollector(account2.address)
      ).to.be.reverted;

      await expect(
        collateralReserve.connect(owner).setFeeCollector(account2.address)
      ).to.not.be.reverted;
    });

    it("only MAINTAINER is able to 'setInvestCollateralRatio'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve
          .connect(anotherAccount)
          .setInvestCollateralRatio(toWei("1"))
      ).to.be.reverted;

      await collateralReserve
        .connect(owner)
        .setInvestCollateralRatio(toWei(toPercent("50")));
      expect(await collateralReserve.investCollateralRatio()).to.be.equal(
        toWei(toPercent("50"))
      );
    });

    it("only MAINTAINER is able to 'setPIDController'", async () => {
      const [owner, account1, anotherPIDController] = await ethers.getSigners();
      await expect(
        collateralReserve.connect(account1).setPIDController(ADDRESS_ZERO)
      ).to.be.reverted;

      // MAINTAINER = owner
      expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
        .true;
      expect(await collateralReserve.getRoleMemberCount(MAINTAINER)).to.eq(
        BIG_ONE
      );
      await expect(
        collateralReserve
          .connect(owner)
          .setPIDController(anotherPIDController.address)
      ).to.not.reverted;
      expect(await collateralReserve.pidController()).to.eq(
        anotherPIDController.address
      );
    });

    it("only MAINTAINER is able to 'addCollateralAddress'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      await expect(
        collateralReserve
          .connect(anotherAccount)
          .addCollateralAddress(synth.address, synthOracle.address)
      ).to.be.revertedWith("Sender is not a maintainer");

      await expect(
        collateralReserve
          .connect(owner)
          .addCollateralAddress(ADDRESS_ZERO, synthOracle.address)
      ).to.be.revertedWith("Zero address detected");

      await expect(
        collateralReserve
          .connect(owner)
          .addCollateralAddress(synth.address, synthOracle.address)
      ).to.be.revertedWith("Oracle is not exists");

      //add oracle
      await collateralReserve.connect(owner).addOracle(synthOracle.address);
      expect(await collateralReserve.oracleExist(synthOracle.address)).to.be
        .true;
      expect(await collateralReserve.oracleArray(BIG_ONE)).to.eq(
        synthOracle.address
      );

      await expect(
        collateralReserve
          .connect(owner)
          .addCollateralAddress(synth.address, synthOracle.address)
      )
        .to.emit(collateralReserve, "AddCollateralToken")
        .withArgs(synth.address);
      expect(await collateralReserve.collateralAddress(synth.address)).to.be
        .true;
      expect(await collateralReserve.collateralAddressArray(BIG_ONE)).to.eq(
        synth.address
      );

      expect(await collateralReserve.oracleOf(synth.address)).to.eq(
        synthOracle.address
      );

      await expect(
        collateralReserve
          .connect(owner)
          .addCollateralAddress(synth.address, synthOracle.address)
      ).to.be.revertedWith("Address already exists");
    });

    it("only MAINTAINER is able to add oracles", async () => {
      const [owner, account1] = await ethers.getSigners();
      // collateral oracle
      await expect(
        collateralReserve.connect(account1).addOracle(ADDRESS_ZERO)
      ).to.be.revertedWith("Sender is not a maintainer");
      await expect(
        collateralReserve.connect(owner).addOracle(ADDRESS_ZERO)
      ).to.be.revertedWith("Zero address detected");
      await expect(
        collateralReserve.connect(owner).addOracle(synthOracle.address)
      )
        .to.emit(collateralReserve, "AddOracle")
        .withArgs(synthOracle.address);
      expect(await collateralReserve.oracleExist(synthOracle.address)).to.be
        .true;
      expect(await collateralReserve.oracleArray(BIG_ONE)).to.eq(
        synthOracle.address
      );
      await expect(
        collateralReserve.connect(owner).addOracle(synthOracle.address)
      ).to.be.revertedWith("Address already exists");
    });

    it("only MAINTAINER is able to 'setBuybackFee' and not exceed 'MAX_FEE'", async () => {
      const [owner] = await ethers.getSigners();
      const _newBuyBackFee = toWei(toPercent("3"));
      await expect(
        collateralReserve.connect(owner).setBuybackFee(toWei(toPercent("6")))
      ).to.be.revertedWith("The new fee is to high");
      expect(
        await collateralReserve.connect(owner).setBuybackFee(_newBuyBackFee)
      )
        .to.emit(collateralReserve, "SetBuybackFee")
        .withArgs(_newBuyBackFee);
      expect(await collateralReserve.buybackFee()).to.eq(_newBuyBackFee);
    });

    it("only MAINTAINER is able to 'setRecollatFee' and not exceed 'MAX_FEE'", async () => {
      const [owner] = await ethers.getSigners();
      const _newRecollatFee = toWei(toPercent("0.1"));
      await expect(
        collateralReserve.connect(owner).setRecollatFee(toWei(toPercent("10")))
      ).to.be.revertedWith("The new fee is to high");
      expect(
        await collateralReserve.connect(owner).setRecollatFee(_newRecollatFee)
      )
        .to.emit(collateralReserve, "SetRecollatFee")
        .withArgs(_newRecollatFee);
      expect(await collateralReserve.recollatFee()).to.eq(_newRecollatFee);
    });

    it("only PAUSER is able to 'toggleRecollateralize'", async () => {
      const [owner, pauser] = await ethers.getSigners();
      //pauser
      expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(
        BIG_ZERO
      );
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);
      expect(await collateralReserve.hasRole(PAUSER, pauser.address)).to.be
        .true;
      expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(BIG_ONE);
      expect(await collateralReserve.recollateralizePaused()).to.be.true;
      await expect(collateralReserve.connect(owner).toggleRecollateralize()).to
        .be.reverted;
      expect(await collateralReserve.connect(pauser).toggleRecollateralize())
        .to.emit(collateralReserve, "RecollateralizeToggled")
        .withArgs(false);
      expect(await collateralReserve.recollateralizePaused()).to.be.false;
    });

    it("only PAUSER is able to 'toggleBuyBack'", async () => {
      const [owner, pauser] = await ethers.getSigners();
      //pauser
      expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(
        BIG_ZERO
      );
      await collateralReserve.connect(owner).grantRole(PAUSER, pauser.address);
      expect(await collateralReserve.hasRole(PAUSER, pauser.address)).to.be
        .true;
      expect(await collateralReserve.getRoleMemberCount(PAUSER)).to.eq(BIG_ONE);

      expect(await collateralReserve.buyBackPaused()).to.be.true;
      await expect(collateralReserve.connect(owner).toggleBuyBack()).to.be
        .reverted;
      expect(await collateralReserve.connect(pauser).toggleBuyBack())
        .to.emit(collateralReserve, "BuybackToggled")
        .withArgs(false);
      expect(await collateralReserve.buyBackPaused()).to.be.false;
    });

    it("only MAINTAINER is able to 'setRefreshCooldown'", async () => {
      const [owner, anotherAccount] = await ethers.getSigners();
      const _newCooldown = 60;
      await expect(
        collateralReserve
          .connect(anotherAccount)
          .setRefreshCooldown(_newCooldown)
      ).to.be.reverted;

      await collateralReserve.connect(owner).setRefreshCooldown(_newCooldown);

      expect(await collateralReserve.refreshCooldown()).to.eq(_newCooldown);
    });

    it("only MAINTAINER is able to 'setShareTWAP'", async () => {
      const [owner, user1, newTWAP] = await ethers.getSigners();
      await expect(
        collateralReserve.connect(user1).setShareTWAP(newTWAP.address)
      ).to.be.reverted;

      await expect(
        collateralReserve.connect(owner).setShareTWAP(newTWAP.address)
      ).to.not.reverted;

      expect(await collateralReserve.shareTWAP()).to.eq(newTWAP.address);
    });

    it("only MAINTAINER is able to 'addSynth'", async () => {
      const [owner, account1] = await ethers.getSigners();
      // MAINTAINER = owner
      expect(await collateralReserve.hasRole(MAINTAINER, owner.address)).to.be
        .true;
      await expect(
        collateralReserve.connect(account1).addSynth(synth.address)
      ).to.be.revertedWith("Sender is not a maintainer");

      // add synth
      await expect(collateralReserve.connect(owner).addSynth(synth.address))
        .to.emit(collateralReserve, "AddSynthToken")
        .withArgs(synth.address);
      expect(await collateralReserve.synthExists(synth.address)).to.be.true;
      expect(await collateralReserve.synthArray(BIG_ZERO)).to.eq(synth.address);

      await expect(
        collateralReserve.connect(owner).addSynth(synth.address)
      ).to.be.revertedWith("Address already exists");
      await expect(
        collateralReserve.connect(owner).addSynth(ADDRESS_ZERO)
      ).to.be.revertedWith("Zero address detected");
    });

    it("only POOL is able to 'requestTransfer' with USDC", async () => {
      const [owner, sender, receiver, pool] = await ethers.getSigners();

      await expect(
        collateralReserve
          .connect(sender)
          .requestTransfer(receiver.address, usdc.address, ONE_ETHER)
      ).to.be.revertedWith("Sender is not a pool");

      await expect(
        collateralReserve
          .connect(receiver)
          .requestTransfer(receiver.address, usdc.address, ONE_ETHER)
      ).to.be.revertedWith("Sender is not a pool");

      await expect(
        collateralReserve
          .connect(owner)
          .requestTransfer(receiver.address, usdc.address, ONE_ETHER)
      ).to.be.revertedWith("Sender is not a pool");

      expect(await usdc.balanceOf(receiver.address)).to.eq(BIG_ZERO);

      // mint
      await usdc.mint(collateralReserve.address, toWei("100"));

      expect(await usdc.balanceOf(collateralReserve.address)).to.eq(
        toWei("100")
      );

      // grantRole
      await collateralReserve.connect(owner).grantRole(POOL, pool.address);

      await collateralReserve
        .connect(pool)
        .requestTransfer(receiver.address, usdc.address, toWei("100"));

      expect(await usdc.balanceOf(receiver.address)).to.eq(toWei("100"));
    });
  });
});
