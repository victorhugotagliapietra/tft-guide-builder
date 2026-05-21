import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "node:path";

// Nitro auto-detects the deploy target — outputs Vercel Build Output API
// (.vercel/output/) when VERCEL=1 is set, otherwise a Node bundle in .output/.
export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
