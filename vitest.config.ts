import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
