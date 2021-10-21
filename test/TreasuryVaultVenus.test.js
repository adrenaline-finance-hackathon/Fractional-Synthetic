const { expect } = require("chai");
const hardhat = require("hardhat");

const busdABI = require("../abis/busd.json");

const {
  startAutoMine,
  stopAutoMine,
  toWei,
  impersonateAccount,
  mineBlock,
  fromWei,
  fastForwardBlock,
  fastForwardTimestamp,
} = require("./utils");

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

// CONSTANTS MAINNET Addresses
const ADDRESSES = {
  BUSD: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
  vBUSD: "0x95c78222b3d6e262426483d42cfa53685a67ab9d",
  comptroller: "0xfd36e2c2a6789db23113685031d7f16329158384",
  ownerBUSD: "0xd2f93484f2d319194cba95c5171b18c1d8cfd6c4",
};

// global contracts
let treasuryVaultVenus;
let busd;
let vBUSD;

// utility functions
const init = async () => {
  const [owner, treasury] = await ethers.getSigners();
  return treasuryVaultVenus.initialize(
    owner.address,
    ADDRESSES.BUSD,
    treasury.address,
    ADDRESSES.vBUSD
  );
};

const mintBUSD = async (address, amount = "20000") => {
  const owner = await impersonateAccount(ADDRESSES.ownerBUSD);
  await busd.connect(owner).mint(toWei(amount));
  await busd.connect(owner).transfer(address, toWei(amount));
};

describe("# TreasuryVaultVenus forking mainnet hardhat_reset", async () => {
  before(async () => {
    // Forking mainnet
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl,
            blockNumber: 8888888,
          },
        },
      ],
    });

    busd = new ethers.Contract(ADDRESSES.BUSD, busdABI, ethers.provider);
    vBUSD = new ethers.Contract(
      ADDRESSES.vBUSD,
      [
        {
          constant: false,
          inputs: [
            { internalType: "uint256", name: "amount", type: "uint256" },
          ],
          name: "mint",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          payable: false,
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          constant: false,
          inputs: [
            { internalType: "uint256", name: "amount", type: "uint256" },
          ],
          name: "redeem",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          payable: false,
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          constant: true,
          inputs: [
            { internalType: "address", name: "account", type: "address" },
          ],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      ethers.provider
    );
  });

  beforeEach(async () => {
    const [owner, treasury] = await ethers.getSigners();

    // deploying TreasuryVaultVenus
    const TreasuryVaultVenus = await ethers.getContractFactory(
      "TreasuryVaultVenus"
    );
    treasuryVaultVenus = await TreasuryVaultVenus.deploy();
    await treasuryVaultVenus.deployed();

    // * CLEAR all BUSD each accounts
    const burn = async (_account) => {
      await busd.connect(_account).burn(await busd.balanceOf(_account.address));
    };
    await burn(owner);
    await burn(treasury);

    // * MINT 20 BUSD to treasury
    await mintBUSD(treasury.address, "20");
    expect(fromWei(await busd.balanceOf(treasury.address))).equals("20.0");
  });

  it("should initialize fail if vToken is not a vToken", async () => {
    const [owner, treasury] = await ethers.getSigners();
    await expect(
      treasuryVaultVenus.initialize(
        owner.address,
        ADDRESSES.BUSD,
        treasury.address,
        ADDRESSES.BUSD
      )
    ).reverted;
  });

  it("should initialize fail if asset != underlying of vToken", async () => {
    const [owner, treasury, signer1, signer2] = await ethers.getSigners();
    await expect(
      treasuryVaultVenus.initialize(
        owner.address,
        signer1.address,
        treasury.address,
        ADDRESSES.vBUSD
      )
    ).revertedWith("asset != underlying");
  });

  it("should be able initialize with correct parameters", async () => {
    const [, treasury] = await ethers.getSigners();
    await init();

    const assetExpected = await treasuryVaultVenus.asset();
    const vTokenExpected = await treasuryVaultVenus.vToken();
    const treasuryExpected = await treasuryVaultVenus.treasury();
    const vComptrollerExpected = await treasuryVaultVenus.vComptroller();
    expect(assetExpected.toLowerCase()).equal(ADDRESSES.BUSD);
    expect(vTokenExpected.toLowerCase()).equal(ADDRESSES.vBUSD);
    expect(treasuryExpected).equal(treasury.address);
    expect(vComptrollerExpected.toLowerCase()).equal(ADDRESSES.comptroller);
  });

  it("should be throw if call deposit with owner", async () => {
    const [owner] = await ethers.getSigners();
    await expect(treasuryVaultVenus.connect(owner).deposit(1)).revertedWith(
      "!treasury"
    );
  });

  it("should be able to call deposit with treasury", async () => {
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));
    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "4826682419",
      "20000000"
    );
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("1"));
  });

  it("should be throw if call withdraw with owner", async () => {
    const [owner] = await ethers.getSigners();
    await expect(treasuryVaultVenus.connect(owner).withdraw()).revertedWith(
      "!treasury"
    );
  });

  it("should be able to deposit multiple times", async () => {
    // ********** deposit **********
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "4826682419",
      "20000000"
    );
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("1"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("19"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("0"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "96533648213",
      "100000000"
    );
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("20"));
  });

  it("should be able to call deposit then withdraw with treasury", async () => {
    // ********** deposit **********
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));
    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "4826682419",
      "20000000"
    );
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("1"));

    // ********** withdraw **********

    await treasuryVaultVenus.connect(treasury).withdraw();

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("0"));
    expect(await busd.balanceOf(treasury.address)).to.closeTo(
      toWei("19.9999").toString(),
      toWei("0.0001").toString()
    );
  });

  it("should be able to call deposit then get reward after pass 57600 blocks", async () => {
    // ********** deposit **********
    await init();

    const [owner, treasury, someone] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "4826682419",
      "20000000"
    );
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("1"));

    // ** 28800 * 2 blocks (2 days) **
    await fastForwardBlock(28800 * 2);

    // ** SOMEONE execute Mint to update exchangeRateMantissa
    await mintBUSD(someone.address, "1");
    await busd.connect(someone).approve(ADDRESSES.vBUSD, toWei("1"));
    await vBUSD.connect(someone).mint(toWei("1"));

    // ********** withdraw **********

    await treasuryVaultVenus.connect(treasury).withdraw();

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("0"));
    expect(await busd.balanceOf(treasury.address)).to.equal(toWei("20"));
    expect(await busd.balanceOf(owner.address)).to.closeTo(
      toWei("0.000007094854881903").toString(),
      toWei("0.00000001").toString()
    );
  });

  it("should be able to call deposit with whale amount then withdrawn with 0.01% penalty", async () => {
    // ********** deposit **********
    await init();

    const [owner, treasury, someone] = await ethers.getSigners();

    // 50M $
    await mintBUSD(treasury.address, "10000000");

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("10000020"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("10000020"));

    // ** SOMEONE execute Mint to update exchangeRateMantissa
    await mintBUSD(someone.address, "1");
    await busd.connect(someone).approve(ADDRESSES.vBUSD, toWei("1"));
    await vBUSD.connect(someone).mint(toWei("1"));

    // ********** withdraw **********

    await treasuryVaultVenus.connect(treasury).withdraw();

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));
    expect(await treasuryVaultVenus.vaultBalance()).equal(toWei("0"));
    expect(await busd.balanceOf(treasury.address)).to.closeTo(
      toWei("9999020").toString(),
      toWei("0.1").toString()
    );
    expect(await busd.balanceOf(owner.address)).to.equal(toWei("0"));
  });

  it("should be able to set new treasury with setTreasury with owner", async () => {
    await init();

    const [owner, , treasury2] = await ethers.getSigners();
    await treasuryVaultVenus.connect(owner).setTreasury(treasury2.address);
  });

  it("should be throw if setTreasury with treasury", async () => {
    await init();

    const [, someone, treasury2] = await ethers.getSigners();
    await expect(
      treasuryVaultVenus.connect(someone).setTreasury(treasury2.address)
    ).revertedWith("Sender is not a maintainer");
  });

  it("should be able to get balanceOfVToken to ZERO", async () => {
    await init();

    expect(await treasuryVaultVenus.balanceOfVToken()).equal(toWei("0"));
  });

  it("should be able to get balanceOfAsset to ZERO", async () => {
    await init();

    expect(await treasuryVaultVenus.balanceOfAsset()).equal(toWei("0"));
  });

  it("should be able to get balanceOfVToken after call deposit to mint vToken", async () => {
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfVToken()).to.closeTo(
      "4826682419",
      "20000000"
    );
  });

  it("should be able to get penalty after call deposit to mint vToken", async () => {
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    expect(await treasuryVaultVenus.balanceOfAsset()).to.closeTo(
      toWei("0.9999999998993718").toString(),
      toWei("0.00000001").toString()
    );

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    const [profit, penalty] = await treasuryVaultVenus.getProfit();
    expect(profit).equal(toWei("0"));
    expect(penalty).to.closeTo(
      toWei("0.00000000017165300").toString(),
      toWei("0.00000000009000000").toString()
    );
  });

  it("should be able to get Profit after call deposit to mint vToken", async () => {
    await init();

    const [, treasury, someone] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    await fastForwardBlock(28800 * 2);

    // ** SOMEONE execute Mint to update exchangeRateMantissa
    await mintBUSD(someone.address, "1");
    await busd.connect(someone).approve(ADDRESSES.vBUSD, toWei("1"));
    await vBUSD.connect(someone).mint(toWei("1"));

    expect(await busd.balanceOf(treasury.address)).equal(toWei("19"));
    const [profit, penalty] = await treasuryVaultVenus.getProfit();
    expect(profit).to.closeTo(
      toWei("0.000107103727200807").toString(),
      toWei("0.0000009").toString()
    );
    expect(penalty).equal(toWei("0"));
  });

  it("should be able to call getUnclaimedIncentiveRewardsBalance", async () => {
    await init();

    const [, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    const unclaimed =
      await treasuryVaultVenus.getUnclaimedIncentiveRewardsBalance();

    expect(unclaimed).equal(toWei("0"));
  });

  it("should be able to call claimIncentiveRewards onlyOwner", async () => {
    await init();

    const [owner, treasury] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await treasuryVaultVenus.connect(treasury).deposit(toWei("1"));

    await treasuryVaultVenus.connect(owner).claimIncentiveRewards();
  });

  it("should be call emit event TreasuryChanged if call setTreasury", async () => {
    await init();

    const [owner, , treasury2] = await ethers.getSigners();

    await expect(
      treasuryVaultVenus.connect(owner).setTreasury(treasury2.address)
    )
      .to.emit(treasuryVaultVenus, "TreasuryChanged")
      .withArgs(treasury2.address);
  });

  it("should be call emit event Deposited if call deposit", async () => {
    await init();

    const [, treasury, treasury2] = await ethers.getSigners();

    await busd
      .connect(treasury)
      .approve(treasuryVaultVenus.address, toWei("20"));

    await expect(treasuryVaultVenus.connect(treasury).deposit(toWei("1")))
      .to.emit(treasuryVaultVenus, "Deposited")
      .withArgs(toWei("1").toString());
  });

  it("should be call emit event Withdrawn and Profited if call withdraw", async () => {
    await init();

    const [, treasury] = await ethers.getSigners();

    await expect(treasuryVaultVenus.connect(treasury).withdraw())
      .to.emit(treasuryVaultVenus, "Profited")
      .withArgs("0");

    await expect(treasuryVaultVenus.connect(treasury).withdraw())
      .to.emit(treasuryVaultVenus, "Withdrawn")
      .withArgs("0");
  });

  it("should be call emit event IncentivesClaimed if call claimIncentiveRewards", async () => {
    await init();

    const [owner] = await ethers.getSigners();

    await expect(treasuryVaultVenus.connect(owner).claimIncentiveRewards())
      .to.emit(treasuryVaultVenus, "IncentivesClaimed")
      .withArgs("0");
  });
});
