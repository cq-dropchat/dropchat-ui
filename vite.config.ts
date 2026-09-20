import { defineConfig, type Plugin } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// F22: records which modules went into each output chunk, so
// scripts/check-bundle.mjs can tell where a library landed (the manifest
// lists chunks, not their modules).
function chunkModules(): Plugin {
  return {
    name: "chunk-modules",
    apply: "build",
    generateBundle(_options, bundle) {
      const modules: Record<string, string[]> = {};
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          modules[output.fileName] = Object.keys(output.modules).map((id) =>
            path.relative(__dirname, id),
          );
        }
      }
      this.emitFile({
        type: "asset",
        fileName: ".vite/chunk-modules.json",
        source: JSON.stringify(modules),
      });
    },
  };
}

// E1: the commit this bundle was built from, stamped on every error issue so
// the panel can answer "which deploy introduced this". Cloudflare Pages sets
// CF_PAGES_COMMIT_SHA on every build; a local build has neither and reports no
// release, which is honest — there is no deploy to point at.
const release =
  process.env.VITE_RELEASE || process.env.CF_PAGES_COMMIT_SHA || "";

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_RELEASE": JSON.stringify(release),
  },
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    chunkModules(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    // F22: scripts/check-bundle.mjs walks the chunk graph from it.
    manifest: true,
    rollupOptions: {
      output: {
        // F22: route definitions (path, beforeLoad, search validation) are
        // static — the router needs them all to match a URL — but each one
        // used to land in its own tiny chunk, 20+ modulepreload requests
        // before React mounted. One chunk instead; the route components stay
        // split (their ids carry ?tsr-split).
        manualChunks(id) {
          if (/[\\/]src[\\/]routes[\\/].*\.tsx$/.test(id)) return "routes";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
