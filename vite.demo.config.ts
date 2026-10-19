import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { dataHome, gitConfigSource, REPO } from "./server/dataHome.ts";
import { savedSettingsPlugin } from "./server/savedSettingsPlugin.ts";

// The static demo (npm run build:demo): src/demo/index.html and what it imports,
// built to dist-demo/ as plain files for a site of their own (Cloudflare Pages),
// with no server behind them, served from the site's root. Its mode,
// "static-demo", is what tells the page it is the static demo (demoMode.ts), and
// src/demo/public/ holds what Cloudflare Pages reads beside the files (_headers,
// _redirects). See README's "Demo". The app itself is served by server/main.ts
// (vite.config.ts). The one thing of yours it carries is your saved view
// settings (the Spider web's, as numbers and choices), as its defaults: read
// from your data folder, which a worktree of your copy finds through git config
// as check-demo does (server/dataHome.ts), by savedSettingsPlugin, which takes
// nothing else.

/** The friend data's folder: nothing in it is ever part of the demo, and the build stops if anything is asked for from it. */
const DATA = fileURLToPath(new URL("./data/", import.meta.url));

function noFriendData(): Plugin {
  return {
    name: "friend-map:no-friend-data",
    enforce: "pre",
    load(id) {
      if (id.startsWith(DATA)) this.error(`the demo may not include anything from data/ (${id.slice(DATA.length)})`);
    },
  };
}

const savedFrom = dataHome({ before: [gitConfigSource(REPO)] }).data;

export default defineConfig({
  root: "src/demo",
  base: "/",
  mode: "static-demo",
  plugins: [
    noFriendData(),
    react(),
    savedSettingsPlugin(savedFrom, (names) => console.log(`The demo's defaults carry the saved view settings from ${savedFrom}: ${names.join(", ") || "none saved"}.`)),
  ],
  // No modulepreload polyfill: it fetches, and the page reaches no network (index.html); every browser it runs in preloads modules itself.
  build: { outDir: "../../dist-demo", emptyOutDir: true, modulePreload: { polyfill: false }, chunkSizeWarningLimit: 2000 },
});
