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

//require("./hardhat");

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
  paths: {
    artifacts: './artifacts'
  },
  networks: {
    // ** LOCAL **
    hardhat: {
      // saveDeployments: true,
      chainId: 1337
      // forking: {
      //   url:
      //     process.env.CUSTOM_RPC_URL ||
      //     "https://rinkeby.infura.io/v3/30d6fb21c68f44f8aed1dbeb583a1b0c",
      //   // blockNumber has no specific means latest block
      //   // blockNumber: "8888888",
      //   enabled: false, // ! disable forking for manual fork each test file
      // },
      // tags: ["test", "local"],
    },

    // ** TESTNET LIST **
    ethTest: {
      url: "hhttps://rinkeby.infura.io/v3/30d6fb21c68f44f8aed1dbeb583a1b0c",
      saveDeployments: true,
      tags: ["ethTest"],
      accounts: getAccounts(),
    },

    // ** MAINNET LIST **
    eth: {
      url: "https://mainnet.infura.io/v3/30d6fb21c68f44f8aed1dbeb583a1b0c",
      saveDeployments: true,
      tags: ["eth"],
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
