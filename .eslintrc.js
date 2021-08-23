module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {},
  globals: {
    task: "readonly",
    __dirname: "readonly",
    process: "readonly",
    ethers: "readonly",
  },
  standard: {
    env: ["mocha"],
  },
};
