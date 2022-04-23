// const { Confirm } = require("enquirer");

// const { grey, yellow, green } = require("chalk");

// task("deploy")
//   //   .addOptionalParam("network", "Network")
//   .setAction(async (taskArgs, hre, runSuper) => {
//     const { network } = taskArgs;
//     console.log(yellow(`Deploying...`));

//     const accounts = await hre.ethers.getSigners();

//     // if (hre.network == "eth" || hre.network == "ethTest") {
//       const prompt = new Confirm({
//         name: "question",
//         message: `Want to continue with deployer ${green(accounts[0].address)}`,
//       });

//       const answer = await prompt.run();
//       if (answer) {
//         await runSuper(taskArgs);
//       } else {
//         console.log(grey("No"));
//       }
//     // } else {
//     //   await runSuper(taskArgs);
//     // }
//   });


const hre = require("hardhat");

const fs = require('fs');

async function main() {
  const UNI = await hre.ethers.getContractFactory("UniswapV2Library");
  const uni = await UNI.deploy();
  await uni.deployed();
  console.log("uni deployed to:", uni.address);

  // fs.writeFileSync('./config.js', `
  // export const uni = "${uni.address}"
  // `)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });