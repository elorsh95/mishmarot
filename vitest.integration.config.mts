import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against the Firebase emulators: npm run test:integration
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      FIREBASE_PROJECT_ID: "demo-mishmarot",
      FIREBASE_API_KEY: "demo-api-key",
    },
  },
});
