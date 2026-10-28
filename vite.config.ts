import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { allowedHosts } from "./server/allowedHosts.ts";
import { BASE_PATH } from "./server/basePath.ts";

// Served in middleware mode by server/main.ts, which owns the port and the /api routes, and adds the plugin that
// serves every page your saved view settings (server/savedSettingsPlugin.ts). It is added there, not here, because
// Vite restarts whenever a file this config imports changes, and that plugin imports app code (src/savedSettings.ts):
// this config imports nothing from src/ (a test keeps it so), and editing the app never restarts Vite.
export default defineConfig(({ mode }) => ({
  appType: "spa",
  // Its modules and hot reload are always under /friend-map/, which server/main.ts answers at the root too
  // (server/basePath.ts), so the page works opened either way.
  base: `${BASE_PATH}/`,
  plugins: [react()],
  server: {
    // Exact extra Host names from FRIEND_MAP_ALLOWED_HOSTS (the environment or .env.local), localhost always.
    allowedHosts: allowedHosts(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "FRIEND_MAP_").FRIEND_MAP_ALLOWED_HOSTS),
    // Friend data changes on every edit; the page follows it through /api/archive/events, not hot reload.
    watch: { ignored: ["**/data/**"] },
  },
}));
