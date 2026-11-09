import { checkClaims } from "./claimScanner.js";

const violations = await checkClaims();
if (violations.length) {
  for (const item of violations)
    process.stderr.write(
      `${item.filename}:${item.line} [${item.ruleId}] ${item.sentence}\n`,
    );
  process.exitCode = 1;
} else process.stdout.write("Forbidden-claims scan passed.\n");
