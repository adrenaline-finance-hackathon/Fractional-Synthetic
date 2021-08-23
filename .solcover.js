module.exports = {
  mocha: {
    grep: "hardhat_reset",
    invert: true,
  },
  skipFiles: ["Math", "mock", "Uniswap"],
};
