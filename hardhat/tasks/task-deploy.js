const { Confirm } = require("enquirer");

const { grey, yellow, green } = require("chalk");

task("deploy")
  //   .addOptionalParam("network", "Network")
  .setAction(async (taskArgs, hre, runSuper) => {
    const { network } = taskArgs;
    console.log(yellow(`Deploying...`));

    const accounts = await hre.ethers.getSigners();

    if (hre.network == "bsc" || hre.network == "bscTest") {
      const prompt = new Confirm({
        name: "question",
        message: `Want to continue with deployer ${green(accounts[0].address)}`,
      });

      const answer = await prompt.run();
      if (answer) {
        await runSuper(taskArgs);
      } else {
        console.log(grey("No"));
      }
    } else {
      await runSuper(taskArgs);
    }
  });
