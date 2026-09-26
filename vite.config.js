import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // Rapier's WASM package confuses esbuild's dep pre-bundler (Vite's own
    // dev-server log recommends this exact fix) — Ball Adventure 3D's
    // physics engine.
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
