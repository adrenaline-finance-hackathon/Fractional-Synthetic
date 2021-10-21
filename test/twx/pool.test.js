const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber, utils } = require("ethers");

// CONSTANTS
const ONE = ethers.utils.parseEther("1");
const ZERO = ethers.utils.parseEther("0");
const MAX_UINT_256 = ethers.constants.MaxUint256;

// UTILS
const { fastForwardBlock, fastForwardToBlock } = require("../utils");

describe("Convert Dopple", function () {
  let twx;
  let busd;
  let pairBusdSuperDop;
  let iPairBusdSuperDop;
  let pairOracle;
  let owner;
  let mockChainlinkAggregator;
  let chainlinkOracleWrapper;
  beforeEach(async () => {
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [],
    // });
    [owner] = await ethers.getSigners();

    const TWX = await ethers.getContractFactory("TWX");
    _twx = await TWX.deploy();
    await _twx.deployed();

    twx = await upgrades.deployProxy(TWX, [owner.address], {
      kind: "transparent",
    });
    await twx.deployed();

    const MockWithName = await ethers.getContractFactory("MockWithName");
    busd = await MockWithName.deploy(ONE, "BUSD", "BUSD");
    await busd.deployed();

    const MockPair = await ethers.getContractFactory("MockPair");
    pairBusdTWX = await MockPair.deploy(
      twx.address,
      busd.address,
      ONE,
      utils.parseEther("0.5")
    );

    iPairBusdTWX = await ethers.getContractAt(
      "IUniswapV2Pair",
      pairBusdTWX.address
    );

    const MockPairOracle = await ethers.getContractFactory("MockPairOracle");
    pairOracle = await MockPairOracle.deploy(utils.parseEther("0.5"));
    await pairOracle.deployed();

    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );
    mockChainlinkAggregator = await MockChainlinkAggregator.deploy(ONE, 18);
    await mockChainlinkAggregator.deployed();

    const ChainlinkOracleWrapper = await ethers.getContractFactory(
      "ChainlinkOracleWrapper"
    );

    const _priceFeed = mockChainlinkAggregator.address;
    const _pairName = "USDC / USD";

    chainlinkOracleWrapper = await ChainlinkOracleWrapper.deploy(
      _priceFeed,
      _pairName
    );
    await chainlinkOracleWrapper.deployed();
  });

  it("Shall have reserve in mock pair", async function () {
    const [reserve0, reserve1] = await pairBusdTWX.getReserves();
    expect(reserve0).to.equals(utils.parseEther("1"));
    expect(reserve1).to.equals(utils.parseEther("0.5"));
  });

  it("Shall get lastest price of TWX from oracle", async function () {
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    const result = await pairOracle.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.5"));
  });

  it("Shall set lastest price of TWX to 0.6", async function () {
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    let result = await pairOracle.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.5"));

    // set new price
    await pairOracle.connect(owner).mock(utils.parseEther("0.6"));
    result = await pairOracle.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.6"));
  });

  it("Shall get latest price of USDC from chainlink oracle", async function () {
    const latestAnswer = await mockChainlinkAggregator.latestAnswer();
    expect(latestAnswer).to.equals(utils.parseEther("1"));
  });

  it("Shall get latest price of USDC from wrapper oracle", async function () {
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    let result = await chainlinkOracleWrapper.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("1"));
  });

  it("Shall set latest price of USDC from chainlink and will effect to wrapper", async function () {
    // chainlink
    let latestAnswer = await mockChainlinkAggregator.latestAnswer();
    expect(latestAnswer).to.equals(utils.parseEther("1"));

    // wrapper
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    let result = await chainlinkOracleWrapper.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("1"));

    // set chainlink
    await mockChainlinkAggregator
      .connect(owner)
      .setLatestPrice(utils.parseEther("0.9"));
    latestAnswer = await mockChainlinkAggregator.latestAnswer();
    expect(latestAnswer).to.equals(utils.parseEther("0.9"));

    // get from wrapper
    result = await chainlinkOracleWrapper.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.9"));
  });

  it("Shall switch to another oracle address", async function () {
    // get new chainlink source
    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );
    const anotherChainlink = await MockChainlinkAggregator.deploy(
      utils.parseEther("0.99"),
      18
    );
    await anotherChainlink.deployed();

    // get new price
    let latestAnswer = await anotherChainlink.latestAnswer();
    expect(latestAnswer).to.equals(utils.parseEther("0.99"));

    // change to new oracle
    await chainlinkOracleWrapper
      .connect(owner)
      .setRefOracleAddress(anotherChainlink.address);

    // get from wrapper
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    result = await chainlinkOracleWrapper.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.99"));
  });

  it("Shall switch to 8 decimal oracle address", async function () {
    // get new chainlink source
    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );

    const _decimals = 8;
    const _mock_price = utils.parseUnits("0.99", _decimals);

    const anotherChainlink = await MockChainlinkAggregator.deploy(
      _mock_price,
      _decimals
    );
    await anotherChainlink.deployed();

    // get new price
    let latestAnswer = await anotherChainlink.latestAnswer();
    expect(latestAnswer).to.equals("99000000");

    // change to new oracle
    await chainlinkOracleWrapper
      .connect(owner)
      .setRefOracleAddress(anotherChainlink.address);

    // get from wrapper
    const token = busd.address;
    const amountIn = utils.parseEther("1");
    result = await chainlinkOracleWrapper.consult(token, amountIn);
    expect(result).to.equals(utils.parseEther("0.99"));
  });
});
