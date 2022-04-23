const { expect } = require("chai");
const {
  config: {
    networks: {
      hardhat: {
        forking: { url: jsonRpcUrl },
      },
    },
  },
  network,
  ethers,
} = require("hardhat");
const fs = require("fs");

const {
  deployContract,
  deployProxy,
  toWei,
  toPercent,
  currentTime,
  fromWei,
} = require("../utils");

const MINTER = ethers.utils.id("MINTER");
const PAUSER = ethers.utils.id("PAUSER");
const MAINTAINER = ethers.utils.id("MAINTAINER");
const UNISWAP_ABI = JSON.parse(
  fs.readFileSync("abis/swap.json").toString()
);

let owner, minter, feeCollector, pauser, maintainer, result;
let kusd,
  doppleX,
  usdc,
  collateralReserve,
  kusdPool,
  usdcOracle,
  doppleXPair,
  doppleXOracle,
  kusdOracle,
  oneClickMint,
  twindexRouter;

describe("OneClickMint", () => {
  before(async () => {
    [owner, minter, feeCollector, pauser, maintainer] =
      await ethers.getSigners();

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl,
          },
        },
      ],
    });
  });

  describe("# Minting", () => {
    describe("offset 0.11%", () => {
      const _swapShareOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      it("can mint by `quickMint` with TCR 50%", async () => {
        const tcr = toWei(toPercent("50"));
        await setupContract(tcr);

        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("50"))
        );
        expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
        expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
        expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("1"));
      });

      it("can mint by `quickMint` with TCR 25%", async () => {
        const tcr = toWei(toPercent("25"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 75%", async () => {
        const tcr = toWei(toPercent("75"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 95%", async () => {
        const tcr = toWei(toPercent("95"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can not mint by `quickMint` with TCR 0%", async () => {
        const tcr = toWei(toPercent("0"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });

      it("can not mint by `quickMint` with TCR 100%", async () => {
        const tcr = toWei(toPercent("100"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Collateral ratio must not be 100% or 0%");
      });
    });

    describe("offset 0.12%", () => {
      const _swapShareOutMin = 0;
      const _offset = toWei(toPercent("0.12"));
      it("can mint by `quickMint` with TCR 50%", async () => {
        const tcr = toWei(toPercent("50"));
        await setupContract(tcr);

        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("50"))
        );
        expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
        expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
        expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("1"));
      });

      it("can mint by `quickMint` with TCR 25%", async () => {
        const tcr = toWei(toPercent("25"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 75%", async () => {
        const tcr = toWei(toPercent("75"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 95%", async () => {
        const tcr = toWei(toPercent("95"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can not mint by `quickMint` with TCR 0%", async () => {
        const tcr = toWei(toPercent("0"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });

      it("can not mint by `quickMint` with TCR 100%", async () => {
        const tcr = toWei(toPercent("100"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Collateral ratio must not be 100% or 0%");
      });
    });

    describe("offset 0.10%", () => {
      const _swapShareOutMin = 0;
      const _offset = toWei(toPercent("0.10"));
      it("can mint by `quickMint` with TCR 50%", async () => {
        const tcr = toWei(toPercent("50"));
        await setupContract(tcr);

        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("50"))
        );
        expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
        expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
        expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 25%", async () => {
        const tcr = toWei(toPercent("25"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 75%", async () => {
        const tcr = toWei(toPercent("75"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 95%", async () => {
        const tcr = toWei(toPercent("95"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can not mint by `quickMint` with TCR 0%", async () => {
        const tcr = toWei(toPercent("0"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });

      it("can not mint by `quickMint` with TCR 100%", async () => {
        const tcr = toWei(toPercent("100"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Collateral ratio must not be 100% or 0%");
      });
    });

    describe("offset 0.09%", () => {
      const _swapShareOutMin = 0;
      const _offset = toWei(toPercent("0.09"));
      it("can mint by `quickMint` with TCR 50%", async () => {
        const tcr = toWei(toPercent("50"));
        await setupContract(tcr);

        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("50"))
        );
        expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
        expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
        expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 25%", async () => {
        const tcr = toWei(toPercent("25"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 75%", async () => {
        const tcr = toWei(toPercent("75"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can mint by `quickMint` with TCR 95%", async () => {
        const tcr = toWei(toPercent("95"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await oneClickMint
          .connect(minter)
          .quickMint(
            _collateralAmount,
            _swapShareOutMin,
            _offset,
            _synthOutMin
          );

        result = await kusd.balanceOf(minter.address);
        console.log("KUSD received", fromWei(result));
        expect(result).is.closeTo(toWei("1000"), toWei("10"));

        result = await doppleX.balanceOf(minter.address);
        console.log("DOPX received", fromWei(result));
        expect(result).is.closeTo(toWei("0"), toWei("5"));
      });

      it("can not mint by `quickMint` with TCR 0%", async () => {
        const tcr = toWei(toPercent("0"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });

      it("can not mint by `quickMint` with TCR 100%", async () => {
        const tcr = toWei(toPercent("100"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Collateral ratio must not be 100% or 0%");
      });
    });

    describe("offset 0%", () => {
      const _swapShareOutMin = 0;
      const _offset = toWei(toPercent("0"));
      it("can mint by `quickMint` with TCR 50%", async () => {
        const tcr = toWei(toPercent("50"));
        await setupContract(tcr);

        expect(await collateralReserve.globalCollateralRatio()).to.eq(
          toWei(toPercent("50"))
        );
        expect(await collateralReserve.getSharePrice()).to.eq(toWei("0.5"));
        expect(await kusdPool.getCollateralPrice()).to.eq(toWei("1"));
        expect(await kusdPool.getSynthPrice()).to.eq(toWei("1"));

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 25%", async () => {
        const tcr = toWei(toPercent("25"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 75%", async () => {
        const tcr = toWei(toPercent("75"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can mint by `quickMint` with TCR 95%", async () => {
        const tcr = toWei(toPercent("95"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Not enough Share inputted");
      });

      it("can not mint by `quickMint` with TCR 0%", async () => {
        const tcr = toWei(toPercent("0"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("Collateral ratio must not be 100% or 0%");
      });

      it("can not mint by `quickMint` with TCR 100%", async () => {
        const tcr = toWei(toPercent("100"));
        await setupContract(tcr);

        const _collateralAmount = toWei("1000");
        const _synthOutMin = 0;

        await expect(
          oneClickMint
            .connect(minter)
            .quickMint(
              _collateralAmount,
              _swapShareOutMin,
              _offset,
              _synthOutMin
            )
        ).to.be.revertedWith("TwindexSwapLibrary: INSUFFICIENT_INPUT_AMOUNT");
      });
    });
  });

  describe("# set variable by maintainer", () => {
    it("can not call function `setRouter` if msg.sender is not a maintainer", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      const TwindexRouterAddress = "0x6B011d0d53b0Da6ace2a3F436Fd197A4E35f47EF"; // Mainnet
      await expect(
        oneClickMint
          .connect(minter)
          .setRouter(TwindexRouterAddress, [usdc.address, doppleX.address])
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("can call function `setRouter` if msg.sender is a maintainer", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      const TwindexRouterAddress = "0x6B011d0d53b0Da6ace2a3F436Fd197A4E35f47EF"; // Mainnet
      await oneClickMint
        .connect(maintainer)
        .setRouter(TwindexRouterAddress, [usdc.address, doppleX.address]);

      expect(await oneClickMint.router()).to.eq(TwindexRouterAddress);
      expect(await oneClickMint.routerPath(0)).to.eq(usdc.address);
      expect(await oneClickMint.routerPath(1)).to.eq(doppleX.address);
    });

    it("can not call function `addWhitelistContract` if msg.sender is not a maintainer", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      await expect(
        oneClickMint
          .connect(minter)
          .addWhitelistContract(ethers.constants.AddressZero)
      ).to.be.revertedWith("Caller is not a maintainer");
    });
  });

  describe("# set offset", () => {
    it("offset 0.11%,TCR 30%", async () => {
      const tcr = toWei(toPercent("30"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;
      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 40%", async () => {
      const tcr = toWei(toPercent("40"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 50%", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 60%", async () => {
      const tcr = toWei(toPercent("60"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 70%", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 80%", async () => {
      const tcr = toWei(toPercent("80"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.11%,TCR 90%", async () => {
      const tcr = toWei(toPercent("90"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("reverted with `Not enough Share inputted` offset 0.10% ,TCR 40%", async () => {
      const tcr = toWei(toPercent("40"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.10"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).to.be.revertedWith("Not enough Share inputted");
    });

    it("reverted with `Not enough Share inputted` offset 0.10% ,TCR 50%", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.10"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).to.be.revertedWith("Not enough Share inputted");
    });

    it("offset 0.10% ,TCR 60%", async () => {
      const tcr = toWei(toPercent("60"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.10"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.10% ,TCR 70%", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);
      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.10"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.12% ,TCR 40%", async () => {
      const tcr = toWei(toPercent("40"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.12"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });

    it("offset 0.12% ,TCR 50%", async () => {
      const tcr = toWei(toPercent("50"));
      await setupContract(tcr);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.12"));
      const _swapShareOutMin = 0;

      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _swapShareOutMin, _offset, _synthOutMin)
      ).not.to.reverted;
    });
  });

  describe("# allowance", () => {
    it("can not `approveAllowance` if msg.sender is not a maintainer", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      await expect(
        oneClickMint
          .connect(minter)
          .approveAllowance(usdc.address, twindexRouter.address)
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("can `approveAllowance` if msg.sender is a maintainer", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      await oneClickMint
        .connect(maintainer)
        .approveAllowance(usdc.address, twindexRouter.address);

      expect(
        await usdc.allowance(oneClickMint.address, twindexRouter.address)
      ).to.eq(ethers.constants.MaxUint256);
    });

    it("can not `revokeAllowance` if msg.sender is not a maintainer", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      await expect(
        oneClickMint
          .connect(minter)
          .revokeAllowance(usdc.address, twindexRouter.address)
      ).to.be.revertedWith("Caller is not a maintainer");
    });

    it("can `revokeAllowance` if msg.sender is a maintainer", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      await oneClickMint
        .connect(maintainer)
        .revokeAllowance(usdc.address, twindexRouter.address);

      expect(
        await usdc.allowance(oneClickMint.address, twindexRouter.address)
      ).to.eq(0);
    });

    it("can not `quickMint` if decrease allowance", async () => {
      const tcr = toWei(toPercent("70"));
      await setupContract(tcr);

      await oneClickMint
        .connect(maintainer)
        .revokeAllowance(usdc.address, twindexRouter.address);

      const _collateralAmount = toWei("1000");
      const _synthOutMin = 0;
      const _offset = toWei(toPercent("0.11"));
      const _swapShareOutMin = 0;
      await expect(
        oneClickMint
          .connect(minter)
          .quickMint(_collateralAmount, _offset, _swapShareOutMin, _synthOutMin)
      ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED'");
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

  [oneClickMint] = await deployProxy("OneClickMint", [
    collateralReserve.address,
    kusdPool.address,
    kusd.address,
    doppleX.address,
    usdc.address,
    usdcOracle.address,
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
  await oneClickMint.grantRole(MAINTAINER, maintainer.address);
  await kusdPool.grantRole(PAUSER, owner.address);
  await kusdPool.toggleMinting();
  await kusdPool.toggleRedeeming();
  await kusdPool.connect(maintainer).setMintingFee(toWei("0"));
  await doppleX.mint(owner.address, toWei("1000000"));
  await doppleX.setTransferLimit(ethers.constants.MaxUint256);
  await kusdPool.addWhitelistContract(oneClickMint.address);
  await approveAll();

  // ! for quick mint
  const TwindexRouterAddress = "0x6B011d0d53b0Da6ace2a3F436Fd197A4E35f47EF"; // Mainnet
  await oneClickMint.setRouter(TwindexRouterAddress, [
    usdc.address,
    doppleX.address,
  ]);

  twindexRouter = await ethers.getContractAt(UNISWAP_ABI, TwindexRouterAddress);

  await oneClickMint.approveAllowance(usdc.address, TwindexRouterAddress);
  await oneClickMint.approveAllowance(usdc.address, kusdPool.address);
  await oneClickMint.approveAllowance(doppleX.address, kusdPool.address);

  // ! add liquidity to twindex router
  const tokenA = usdc.address;
  const tokenB = doppleX.address;
  const amountADesired = toWei("400000");
  const amountBDesired = toWei("800000");
  const amountAMin = 0;
  const amountBMin = 0;
  const to = minter.address;
  const deadline = (await currentTime()) + 600;

  // approve usdc and dopx to router
  await usdc.approve(TwindexRouterAddress, ethers.constants.MaxUint256);
  await doppleX.approve(TwindexRouterAddress, ethers.constants.MaxUint256);

  result = await twindexRouter.addLiquidity(
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    to,
    deadline
  );
  await result.wait();
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
  await usdc
    .connect(minter)
    .approve(oneClickMint.address, ethers.constants.MaxUint256);
};
