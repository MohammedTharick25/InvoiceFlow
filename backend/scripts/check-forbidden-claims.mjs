import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkClaims } from "../../scripts/claimScanner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const violations = await checkClaims(root);
if (violations.length) {
  for (const item of violations)
    process.stderr.write(
      `${item.filename}:${item.line} [${item.ruleId}] ${item.sentence}\n`,
    );
  process.exitCode = 1;
} else process.stdout.write("Forbidden-claims scan passed.\n");
