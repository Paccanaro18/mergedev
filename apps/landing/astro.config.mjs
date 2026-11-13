// @ts-check
import { defineConfig } from "astro/config";

// Site 100% estático: nada de SSR nem adapter.
// Estilos e scripts sempre em arquivos externos para funcionar com uma CSP
// estrita (veja vercel.json e scripts/check-dist.mjs).
export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
