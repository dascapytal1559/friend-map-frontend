// Serves your saved view settings (viewSettings.ts) into every page,
// as JSON in <script type="application/json" id="friend-map-saved-settings">
// in its head, which the page reads as it opens (src/savedStore.ts): the real
// app's settings come from it, and the demo's defaults. Read afresh for each
// page in the app (server/main.ts), and once by the demo's build
// (vite.demo.config.ts), which so carries your choices as they were
// when it was built. Only the saved settings, each one of its own values,
// ever go in: never anything else from the data folder.

import type { Plugin } from "vite";
import { SAVED_SETTINGS_ID, savedSettingsJson } from "../src/savedSettings.ts";
import { readViewSettings } from "./viewSettings.ts";

/** The plugin, reading the saved set from `dataDir`; `built` hears, in a build, which settings went in. */
export function savedSettingsPlugin(dataDir: string, built?: (names: string[]) => void): Plugin {
  return {
    name: "friend-map:saved-settings",
    async transformIndexHtml(_html, context) {
      const saved = await readViewSettings(dataDir);
      if (!context.server) built?.(Object.keys(saved));
      return [{ tag: "script", attrs: { type: "application/json", id: SAVED_SETTINGS_ID }, children: savedSettingsJson(saved), injectTo: "head" }];
    },
  };
}
