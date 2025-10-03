import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const repoBase = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? (repoBase ? `/${repoBase}/` : "/"),
  test: {
    environment: "jsdom"
  }
});
