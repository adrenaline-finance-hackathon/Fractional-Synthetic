const { task } = require("hardhat/config");

const { gray, yellow } = require("chalk");

task("test")
  .addFlag("gas", "Compile gas usage")
  .setAction(async (taskArgs, hre, runSuper) => {
    const { gas } = taskArgs;

    if (gas) {
      console.log(
        gray(`Enabling ${yellow("gas")} reports, tests will run slower`)
      );
      hre.config.gasReporter.enabled = true;
    }

    await runSuper(taskArgs);
  });
