import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only apply in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri` and the cargo workspace's
      // shared build output (crates/penguingit-mcp, crates/penguingit-server
      // also build into the repo-root `target/`, not just src-tauri's)
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
  },
}));
