// Extracts ABI-only JSON files from compiled Hardhat artifacts into sdk/abi/.
// Run after `npx hardhat compile` so the SDK can import small ABI files
// instead of full artifact JSONs (which include bytecode + source maps and
// inflate browser bundles by ~MB per contract).

import { promises as fs } from "fs";
import * as path from "path";

interface SdkAbiTarget {
  artifact: string;
  out: string;
}

const REPO_ROOT = path.resolve(__dirname, "..");
const ARTIFACTS_ROOT = path.join(REPO_ROOT, "artifacts");
const SDK_ABI_DIR = path.join(REPO_ROOT, "sdk", "abi");

const TARGETS: SdkAbiTarget[] = [
  {
    artifact: "contracts/core/VinuSwapPool.sol/VinuSwapPool.json",
    out: "VinuSwapPool.json",
  },
  {
    artifact: "contracts/periphery/SwapRouter.sol/SwapRouter.json",
    out: "SwapRouter.json",
  },
  {
    artifact:
      "contracts/periphery/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
    out: "NonfungiblePositionManager.json",
  },
  {
    artifact: "contracts/periphery/VinuSwapQuoter.sol/VinuSwapQuoter.json",
    out: "VinuSwapQuoter.json",
  },
];

async function main() {
  await fs.mkdir(SDK_ABI_DIR, { recursive: true });

  for (const { artifact, out } of TARGETS) {
    const src = path.join(ARTIFACTS_ROOT, artifact);
    const dst = path.join(SDK_ABI_DIR, out);

    const raw = await fs.readFile(src, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.abi) {
      throw new Error(`Artifact ${artifact} has no abi field`);
    }

    await fs.writeFile(dst, JSON.stringify(parsed.abi, null, 2) + "\n");
    console.log(`wrote ${path.relative(REPO_ROOT, dst)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
