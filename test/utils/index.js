const { ethers, network } = require("hardhat");
const { BigNumber } = require("ethers");

const mineBlock = () => ethers.provider.send("evm_mine", []);

/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await ethers.provider.getBlock("latest");
  return timestamp;
};

/**
 *  Takes a snapshot and returns the ID of the snapshot for restoring later.
 */
const takeSnapshot = async () => {
  const result = await ethers.provider.send("evm_snapshot", []);
  await mineBlock();

  return result;
};

/**
 *  Restores a snapshot that was previously taken with takeSnapshot
 *  @param id The ID that was returned when takeSnapshot was called.
 */
const restoreSnapshot = async (id) => {
  await ethers.provider.send("evm_revert", [id]);
  await mineBlock();
};

// decimal > wei 10^18
const toWei = (amount) => ethers.utils.parseEther(amount + "");
// wei 10^18 > decimal
const fromWei = (amount) => ethers.utils.formatEther(amount + "");

const startAutoMine = () => ethers.provider.send("evm_setAutomine", [true]);

const stopAutoMine = () => ethers.provider.send("evm_setAutomine", [false]);

/**
 *  impersonate account to sendTransaction in our test
 *  with set balance to default 100
 */
const impersonateAccount = async (address, balance = 100) => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  await ethers.provider.send("hardhat_setBalance", [
    address,
    // cannot use ethers.parseEther.toHexString because it has extra in prefix 0
    `0x${(+balance * 1e18).toString(16)}`,
  ]);

  await mineBlock();

  const signer = await ethers.getSigner(address);
  return signer;
};

const stopImpersonateAccount = async (address) => {
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
  await mineBlock();
};

const fastForwardBlock = (number) => {
  const promises = [];
  for (let i = 0; i < number; i++) {
    promises.push(mineBlock());
  }
  return Promise.all(promises);
};

const fastForwardToBlock = async (number) => {
  const now = await ethers.provider.getBlockNumber();
  return fastForwardBlock(number - now);
};

const fastForwardTimestamp = async (seconds) => {
  await network.provider.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await mineBlock();
};

/**
 *  Increases the time in the EVM to as close to a specific date as possible
 *  NOTE: Because this operation figures out the amount of seconds to jump then applies that to the EVM,
 *  sometimes the result can vary by a second or two depending on how fast or slow the local EVM is responding.
 *  @param time Date object representing the desired time at the end of the operation
 */
const fastForwardToTimestamp = async (time) => {
  if (typeof time === "string") time = parseInt(time);

  const timestamp = await currentTime();
  const now = new Date(timestamp * 1000);
  if (time < now)
    throw new Error(
      `Time parameter (${time}) is less than now ${now}. You can only fast forward to times in the future.`
    );

  const secondsBetween = Math.floor((time.getTime() - now.getTime()) / 1000);

  await fastForwardTimestamp(secondsBetween);
};

const deployContract = async (contractName, args) => {
  const contract = await ethers.getContractFactory(contractName);
  return (await contract.deploy(...args)).deployed();
};

const deployProxy = async (
  contractName,
  args,
  options = {
    kind: "transparent",
  }
) => {
  const contract = await ethers.getContractFactory(contractName);
  await (await contract.deploy()).deployed();

  // upgrades is global
  const proxy = await (
    await upgrades.deployProxy(contract, args, options)
  ).deployed();
  return [proxy, contract];
};

const toPercent = (n) =>
  fromWei(BigNumber.from(toWei(n)).div("100")).toString();

module.exports = {
  mineBlock,
  currentTime,
  takeSnapshot,
  restoreSnapshot,
  toWei,
  fromWei,
  startAutoMine,
  stopAutoMine,
  impersonateAccount,
  stopImpersonateAccount,
  fastForwardBlock,
  fastForwardToBlock,
  fastForwardTimestamp,
  fastForwardToTimestamp,
  deployContract,
  deployProxy,
  toPercent,
};
