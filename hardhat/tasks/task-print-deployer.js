const { grey, green } = require("chalk");

task("print-deployer", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  console.log(grey("Account list..."));
  for (const account of accounts) {
    console.log(green(account.address));
  }
});
