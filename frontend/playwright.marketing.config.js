import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/marketing-e2e",
  use: { baseURL: "http://127.0.0.1:4174", ...devices["Desktop Chrome"] },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview ../marketing --config vite.marketing.config.js --host 127.0.0.1 --port 4174 --strictPort",
    port: 4174,
    reuseExistingServer: !process.env.CI,
  },
});
