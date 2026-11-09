import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

export default defineConfig({
  base: "/parity/",
  root: path.dirname(
    fileURLToPath(new URL("./tests/browser/index.html", import.meta.url)),
  ),
  build: { outDir: "../../dist/parity", emptyOutDir: false },
  server: { host: "127.0.0.1" },
});
