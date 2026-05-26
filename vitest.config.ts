import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.WXT_API_BASE_URL": JSON.stringify("http://localhost:8787")
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"]
  },
  resolve: {
    alias: {
      "@": "/src",
      "@worker": "/worker/src"
    }
  }
});
