import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoBase = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? (repoBase ? `/${repoBase}/` : "/"),
  build: {
    outDir: "dist",
    sourcemap: true
  },
  test: {
    environment: "jsdom"
  }
});
