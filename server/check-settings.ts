// Checks friend-map's settings file the way the app reads it, without the server:
//
//   npm run check-settings                 checks the data folder's settings.json (see dataHome.ts)
//   node server/check-settings.ts <dir>    checks <dir>'s
//
// The people are the backend's to check (the life archive's check-data, in its own folder).
// Prints one line per problem and a summary, and exits 0 when all is fine (or there is no
// settings file, which is every default), 1 when something needs fixing, and 2 when the file
// could not be read.

import "./onPinnedNode.ts";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { dataHome } from "./dataHome.ts";
import { readSettings, settingsFile } from "./settings.ts";

const dataDir = process.argv[2] ? resolve(process.argv[2]) : dataHome().data;

try {
  const hasSettings = await access(settingsFile(dataDir)).then(() => true, () => false);
  const settings = await readSettings(dataDir);
  for (const problem of settings.problems) console.log(`settings.json: ${problem}`);
  if (hasSettings) console.log(`Checked ${settingsFile(dataDir)}: ${settings.problems.length === 0 ? "all fine." : "to fix."}`);
  else console.log(`No ${settingsFile(dataDir)}: every setting is its default.`);
  if (settings.problems.length > 0) process.exitCode = 1;
} catch (error) {
  console.log(`Could not check ${settingsFile(dataDir)}: ${(error as Error).message}`);
  process.exitCode = 2;
}
