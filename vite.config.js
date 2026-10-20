import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // The pages are fetched on demand (src/lib/lazyPages.js), but their CSS still ships as ONE stylesheet in a fixed
    // order (src/allStyles.js): where two rules weigh the same the later one wins, so a different order could change a look.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Libraries that rarely change get files of their own, so deploying the app's own code does not make everyone
        // download React, Supabase and Firebase again.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          if (/[\\/]node_modules[\\/](firebase|@firebase|idb)[\\/]/.test(id)) return "vendor-firebase";
          return undefined;
        },
      },
    },
  },
});