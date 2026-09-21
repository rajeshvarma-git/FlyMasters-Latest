import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * One build for every portal.
 *
 * Each portal keeps its own source tree under src/portals/<name> and its own
 * "@<name>/" alias, so the four codebases merge without renaming 400+ imports
 * or resolving the file collisions between them (each had its own App.tsx,
 * lib/api.ts, components/ui/Button.tsx, and so on). Deduplicating those into
 * src/shared is a later, separate change — it is not required to get one repo,
 * one deploy and one login.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_TARGET || "http://127.0.0.1:8788";

  return {
    server: {
      host: true,
      port: 8080,
      allowedHosts: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/__auth": { target: apiTarget, changeOrigin: true },
        "/__session": { target: apiTarget, changeOrigin: true },
        "/__local_db": { target: apiTarget, changeOrigin: true },
        "/__storage": { target: apiTarget, changeOrigin: true },
        "/__db_health": { target: apiTarget, changeOrigin: true },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./src/shared"),
        "@admin": path.resolve(__dirname, "./src/portals/admin"),
        "@counselor": path.resolve(__dirname, "./src/portals/counselor"),
        "@telecaller": path.resolve(__dirname, "./src/portals/telecaller"),
        "@student": path.resolve(__dirname, "./src/portals/student"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  };
});
