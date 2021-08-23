const { expect } = require("chai");
const { BigNumber } = require("ethers");
const hardhat = require("hardhat");

const usdcABI = require("../../abis/usdc.json");
const swapABI = require("../../abis/swap.json");

const {
  startAutoMine,
  stopAutoMine,
  toWei,
  toPercent,
  currentTime,
  fastForwardTimestamp,
  deployContract,
  fromWei,
  fastForwardBlock,
  impersonateAccount,
  stopImpersonateAccount,
} = require("../utils");

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
} = hardhat;

describe("Stable Pool Oracle", async () => {
  const SWAP_ADDRESS = "0x2EADe35C49f3f1E041576aCE336f5A58C0Ad8968";
  const KUSD = {
    index: 2,
    address: "0x940Ff63e82d15fb47371BFE5a4ed7D7D183dE1A5",
  };
  const BUSD = {
    index: 1,
    address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  };
  const USDC = {
    index: 0,
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  };

  let oracle, result;
  let mainnetKUSD, mainnetSWAP, mainnetUSDC;

  const addLiquidity = async (
    coin = mainnetUSDC,
    amount = "1",
    lp = ["0", "0", "0"]
  ) => {
    const owner = await impersonateAccount(await coin.getOwner());
    await coin.connect(owner).mint(amount);
    await coin.connect(owner).approve(SWAP_ADDRESS, amount);
    await mainnetSWAP
      .connect(owner)
      .addLiquidity(lp, "0", new Date().getTime() + 3000);
    await stopImpersonateAccount(owner.address);
  };

  const swap = async ({ coin = mainnetUSDC, from = "0", to = "2", amount }) => {
    const owner = await impersonateAccount(await coin.getOwner());
    await coin.connect(owner).mint(amount);
    await coin.connect(owner).approve(SWAP_ADDRESS, amount);
    await mainnetSWAP
      .connect(owner)
      .swap(from, to, amount, "0", new Date().getTime() + 3000);
    await stopImpersonateAccount(owner.address);
  };
  let owner, consummer;
  before(async () => {
    [owner, consummer] = await ethers.getSigners();
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl,
            blockNumber: 10185187,
          },
        },
      ],
    });
    console.log("network", network.name);
    oracle = await deployContract("StablePoolOracle", [
      SWAP_ADDRESS,
      KUSD.address,
      USDC.address,
    ]);

    mainnetKUSD = new ethers.Contract(KUSD.address, usdcABI, ethers.provider);
    mainnetUSDC = new ethers.Contract(USDC.address, usdcABI, ethers.provider);
    mainnetBUSD = new ethers.Contract(BUSD.address, usdcABI, ethers.provider);
    mainnetSWAP = new ethers.Contract(SWAP_ADDRESS, swapABI, ethers.provider);

    const swapKUSD = await mainnetKUSD.balanceOf(SWAP_ADDRESS);
    const swapUSDC = await mainnetUSDC.balanceOf(SWAP_ADDRESS);
    console.log("swapKUSD = ", fromWei(swapKUSD).toString());
    console.log("swapUSDC = ", fromWei(swapUSDC).toString());

    kusdPair = await deployContract("MockPairV2", [
      KUSD.address,
      USDC.address,
      "1000",
      "500",
    ]);
    uniPairOracleTWAP = await deployContract("MockPairOracleV2", [
      kusdPair.address,
    ]);
    await uniPairOracleTWAP.update();
  });

  describe("#Oracle", async () => {
    it("Deployment should assign with default value correctly...", async () => {
      expect(await oracle.fromTokenIndex()).to.eq(2);
      expect(await oracle.toTokenIndex()).to.eq(0);
      expect(await oracle.swap()).to.eq(SWAP_ADDRESS);
    });
  });

  describe("##Consult", async () => {
    it("should consult after deploy with correct price", async () => {
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
    });

    it("should consult with disable TWAP", async () => {
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
    });

    it("should consult with enable TWAP", async () => {
      await oracle.connect(owner).toggleMode();
      result = await oracle.enableTwap();
      expect(result).to.eq(true);
      await fastForwardTimestamp(600);
      await fastForwardBlock(200);
      await oracle.update();
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
    });
  });

  describe("##Update", async () => {
    it("should not update if not pass `timeElapsed`", async () => {
      await expect(oracle.update()).to.be.revertedWith(
        "StablePoolOracle: PERIOD_NOT_ELAPSED"
      );
    });

    it("should get fee", async () => {
      const fee = await oracle.fee();
      console.log("fee = ", fee.toString());
    });

    it("should update 3 times and returns correct price", async () => {
      await fastForwardTimestamp(600);
      await fastForwardBlock(200);
      await oracle.update();
      result = await oracle.consult(KUSD.address, toWei("1"));
      console.log("result = ", fromWei(result).toString());

      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));

      await swap({ amount: toWei("10000") });
      await fastForwardTimestamp(600);
      await fastForwardBlock(200);
      await oracle.update();

      result = await oracle.consult(KUSD.address, toWei("1"));
      console.log("result = ", fromWei(result).toString());

      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));

      await swap({ amount: toWei("10000") });
      await fastForwardTimestamp(600);
      await oracle.update();

      result = await oracle.consult(KUSD.address, toWei("1"));
      console.log("result = ", fromWei(result).toString());

      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
    });

    it("should be getPrice with average after update 50 times then price shock", async () => {
      console.log();

      const _update = async () => {
        await fastForwardTimestamp(600);
        await oracle.update();
      };
      for (let i = 0; i < 10; i++) {
        await swap({ amount: toWei("1") });
        await _update();
      }

      result = await oracle.consult(KUSD.address, toWei("1"));
      console.log("result = ", fromWei(result).toString());

      await swap({ amount: toWei("100000") });
      await fastForwardTimestamp(600);
      await oracle.update();

      result = await oracle.consult(KUSD.address, toWei("1"));
      console.log("result = ", result.toString());
    });

    it("should update within same block with no error", async () => {
      await stopAutoMine();
      await fastForwardTimestamp(600);
      await fastForwardBlock(200);
      await oracle.update();
      await oracle.update();
      await oracle.update();
      await startAutoMine();
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
      result = await oracle.consult(KUSD.address, toWei("1"));
      expect(result).is.closeTo(toWei("0.99"), toWei("1.01"));
    });
  });

  describe("##Toggle TWAP Mode", async () => {
    it("should not toggle mode if not an admin", async () => {
      await expect(oracle.connect(consummer).toggleMode()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should toggle mode from enable to disable", async () => {
      await oracle.connect(owner).toggleMode();
      result = await oracle.enableTwap();
      expect(result).to.eq(false);
    });

    it("should toggle mode from disable to enable", async () => {
      await oracle.connect(owner).toggleMode();
      result = await oracle.enableTwap();
      expect(result).to.eq(true);
    });
  });
});
