import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifyPins } from "../../scripts/verify-pins.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const errors = await verifyPins(root);
if (errors.length) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    "Dependency pins match manifests, documentation, and lockfiles.\n",
  );
