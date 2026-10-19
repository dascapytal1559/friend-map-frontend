// friend-map's own server as the demo has it (appApi.ts): the default settings, and the sun always the sun. Nothing
// here is kept or asked of a server.

import type { AppApi } from "../appApi.ts";
import { ArchiveError } from "../archiveApi.ts";
import { DEFAULT_SETTINGS } from "../settings.ts";

const readOnly = () => Promise.reject(new ArchiveError("refused (403): the demo is read-only", "This is a demo of made-up people: nothing here can be changed."));

export const demoApp: AppApi = {
  settings: () => Promise.resolve({ settings: { ...DEFAULT_SETTINGS }, problems: [] }),
  // The demo's sun is always the sun: it never asks for your photo.
  mePhoto: () => Promise.resolve(null),
  setMePhoto: readOnly,
  removeMePhoto: readOnly,
};
