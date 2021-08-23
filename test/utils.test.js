const { fastForwardTimestamp, fastForwardToTimestamp } = require("./utils");

describe("#Utils", async () => {
  it("should be able run fastForwardTimestamp", async () => {
    await fastForwardTimestamp(60e3);
  });

  it("should be able run fastForwardToTimestamp", async () => {
    const next3days = new Date();
    next3days.setDate(next3days.getDate() + 3);
    await fastForwardToTimestamp(next3days);
  });
});
