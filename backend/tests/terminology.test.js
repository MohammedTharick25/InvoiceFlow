import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

async function files(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      items.map((item) =>
        item.isDirectory()
          ? files(path.join(dir, item.name))
          : [path.join(dir, item.name)],
      ),
    )
  ).flat();
}

describe("terminology guard skeleton", () => {
  it("keeps delivery controls and receipt-implying language out of Phase 1 source", async () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const sources = await Promise.all(
      (await files(path.join(root, "frontend/src"))).map((file) =>
        readFile(file, "utf8"),
      ),
    );
    const source = sources.join("\n");
    expect(source).not.toMatch(/Send invoice/i);
    expect(source).not.toMatch(/\/send(?:\b|['"`])/i);
    expect(source).not.toMatch(
      /(?:status|label).{0,40}\b(?:delivered|received by customer|viewed)\b/i,
    );
    expect(source).not.toMatch(/Finalize.{0,30}\b(?:send|deliver)\b/i);
  });
});
