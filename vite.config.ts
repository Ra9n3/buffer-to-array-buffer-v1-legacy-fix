import path from "path";
import { fileURLToPath } from "url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    // The Console's segment-display fonts (src/assets/fonts/dseg, ~5 KB each)
    // sit just above Vite's default 4 KB inline limit; inline them so the
    // build stays one self-contained HTML file. Everything else keeps the default.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? true : undefined),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    // The Arena live preview is proxied under a sandbox host; allow it here too,
    // not only in `preview`, so `npm run dev` works in the preview pane.
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    // The Arena live preview is proxied under a sandbox host; allow it explicitly.
    allowedHosts: true,
  },
});
