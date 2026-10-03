import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/server/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
  },
});
