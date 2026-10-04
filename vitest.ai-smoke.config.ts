import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately separate from automated server tests and CI.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", disableConsoleIntercept: true, include: ["scripts/ai-smoke.test.ts"], fileParallelism: false, maxWorkers: 1, testTimeout: 20_000 },
});
