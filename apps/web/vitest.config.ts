import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    clearMocks: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
