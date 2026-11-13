import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Workspace packages ship as ESM in dist/; bundle them into main/preload
// instead of leaving them as runtime requires.
const workspacePackages = ["@merge/core", "@merge/providers", "@merge/runner", "@merge/store"];

export default defineConfig({
  main: { build: { externalizeDeps: { exclude: workspacePackages } } },
  preload: { build: { externalizeDeps: { exclude: workspacePackages } } },
  renderer: { plugins: [react()] },
});
