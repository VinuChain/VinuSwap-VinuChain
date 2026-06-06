const { spawnSync } = require("child_process");
const path = require("path");

const hardhatCli = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "hardhat",
  "internal",
  "cli",
  "bootstrap.js"
);
const args = [hardhatCli, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    TS_NODE_FILES: "true",
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
