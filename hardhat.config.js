require("dotenv").config();

require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan"); // contract verification service.
require("hardhat-spdx-license-identifier");
require("hardhat-gas-reporter");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("solidity-coverage");
require("@openzeppelin/hardhat-upgrades");

const { removeConsoleLog } = require("hardhat-preprocessor");

require("./hardhat");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

// ** Define solidity compiler version and optimizer **
const compilers = ["0.6.12"].map((version) => ({
  version,
  settings: { optimizer: { enabled: true, runs: 200 } },
}));

const getAccounts = (isProduction) =>
  new Array(10)
    .fill(undefined)
    .map(
      (v, i) =>
        process.env[
          `DEPLOYER_PRIVATE_KEY_${isProduction ? "MAINNET" : "TESTNET"}_${i}`
        ]
    )
    .filter((pk) => !!pk);

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    // ** LOCAL **
    hardhat: {
      saveDeployments: true,
      forking: {
        url:
          process.env.CUSTOM_RPC_URL ||
          "https://silent-dry-snow.bsc.quiknode.pro/f1f2b47a65d0915c18d72f3928a57c8c3b3e8b04/",
        // blockNumber has no specific means latest block
        // blockNumber: "8888888",
        enabled: false, // ! disable forking for manual fork each test file
      },
      tags: ["test", "local"],
    },

    // ** TESTNET LIST **
    bscTest: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      saveDeployments: true,
      tags: ["bscTest"],
      accounts: getAccounts(),
    },
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      saveDeployments: true,
      tags: ["maticTest"],
      accounts: getAccounts(),
    },

    // ** MAINNET LIST **
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      saveDeployments: true,
      tags: ["bsc"],
      accounts: getAccounts(true),
    },
    matic: {
      url: "https://rpc-mainnet.matic.quiknode.pro",
      saveDeployments: true,
      tags: ["matic"],
      accounts: getAccounts(true),
    },
  },
  namedAccounts: {
    deployer: 0, // naming accounts[0] as deployer
    proxyAdmin: 1,
  },
  mocha: {
    timeout: 180e3, // 60 seconds
  },
  solidity: {
    compilers,
  },
  gasReporter: {
    enabled: false,
    showTimeSpent: true,
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  etherscan: {
    apiKey: process.env.BSC_API_KEY,
  },
  preprocess: {
    eachLine: removeConsoleLog(
      (hre) =>
        hre.network.name !== "hardhat" && hre.network.name !== "localhost"
    ),
  },
};
