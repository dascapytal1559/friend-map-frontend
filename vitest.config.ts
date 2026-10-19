import { defineConfig } from "vitest/config";
import { requirePinnedNode } from "./server/nodeVersion.ts";

requirePinnedNode();

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "src/**/*.test.ts", "examples/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
