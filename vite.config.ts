import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { allowedHosts } from "./server/allowedHosts.ts";
import { BASE_PATH } from "./server/basePath.ts";
import { dataHome } from "./server/dataHome.ts";
import { savedSettingsPlugin } from "./server/savedSettingsPlugin.ts";

// Served in middleware mode by server/main.ts, which owns the port and the /api routes.
export default defineConfig(({ mode }) => ({
  appType: "spa",
  // Its modules and hot reload are always under /friend-map/, which server/main.ts answers at the root too
  // (server/basePath.ts), so the page works opened either way.
  base: `${BASE_PATH}/`,
  // Every page is served your saved view settings, read afresh (server/savedSettingsPlugin.ts).
  plugins: [react(), savedSettingsPlugin(dataHome().data)],
  server: {
    // Exact extra Host names from FRIEND_MAP_ALLOWED_HOSTS (the environment or .env.local), localhost always.
    allowedHosts: allowedHosts(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "FRIEND_MAP_").FRIEND_MAP_ALLOWED_HOSTS),
    // Friend data changes on every edit; the page follows it through /api/archive/events, not hot reload.
    watch: { ignored: ["**/data/**"] },
  },
}));
