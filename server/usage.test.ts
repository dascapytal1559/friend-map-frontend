import { execFile } from "node:child_process";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usageReport } from "./usage-report.ts";
import { readUsage, recordUsage, summarizeUsage, usageFile, type UsageRecord } from "./usage.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-28T12:00:00+10:00");

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "friend-map-usage-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("recordUsage and readUsage", () => {
  it("appends one line per report, stamped with the time, and reads them back", async () => {
    const file = usageFile(dataDir);
    expect(await readUsage(file)).toEqual([]);
    await recordUsage(file, { view: "orbits", opened: NOW - 1000, seconds: 0 }, NOW);
    await recordUsage(file, { view: "orbits", opened: NOW - 1000, seconds: 59.6 }, NOW + 60_000);
    // A line cut short by a crash is skipped.
    await appendFile(file, '{"view":"riv');
    expect(await readUsage(file)).toEqual([
      { view: "orbits", opened: NOW - 1000, at: NOW, seconds: 0 },
      { view: "orbits", opened: NOW - 1000, at: NOW + 60_000, seconds: 60 },
    ]);
  });

  it("refuses anything but a view's slug, a plausible start and a sane number of seconds", async () => {
    const file = usageFile(dataDir);
    for (const bad of [
      { view: "Orbits", opened: NOW, seconds: 0 },
      { view: "a/b", opened: NOW, seconds: 0 },
      { view: "orbits", opened: NOW + DAY, seconds: 0 },
      { view: "orbits", opened: NOW - 400 * DAY, seconds: 0 },
      { view: "orbits", opened: NOW, seconds: -1 },
      { view: "orbits", opened: NOW, seconds: 7 * 60 * 60 },
      { view: "orbits", opened: NOW, seconds: "10" },
      null,
    ]) {
      await expect(recordUsage(file, bad, NOW), JSON.stringify(bad)).rejects.toThrow();
    }
    expect(await readUsage(file)).toEqual([]);
  });
});

describe("summarizeUsage", () => {
  const record = (view: string, openedDaysAgo: number, seconds: number, atDaysAgo = openedDaysAgo): UsageRecord => ({
    view, opened: NOW - openedDaysAgo * DAY, at: NOW - atDaysAgo * DAY, seconds,
  });

  it("gives each view its last open, and opens and minutes in the last 30 days and all time", () => {
    const records = [
      record("orbits", 2, 0), record("orbits", 2, 60), record("orbits", 2, 60),
      record("orbits", 40, 0), record("orbits", 40, 600),
      record("river", 45, 0), record("river", 45, 120),
      // A visit begun before the window whose visible time was reported inside it.
      record("canvas", 31, 0), record("canvas", 31, 300, 29),
      record("retired-view", 3, 0),
    ];
    const summary = summarizeUsage(records, ["orbits", "river", "reciprocity", "canvas"], NOW);
    expect(summary).toEqual([
      { view: "orbits", lastOpened: NOW - 2 * DAY, last30: { opens: 1, minutes: 2 }, allTime: { opens: 2, minutes: 12 } },
      { view: "river", lastOpened: NOW - 45 * DAY, last30: { opens: 0, minutes: 0 }, allTime: { opens: 1, minutes: 2 } },
      { view: "reciprocity", lastOpened: null, last30: { opens: 0, minutes: 0 }, allTime: { opens: 0, minutes: 0 } },
      { view: "canvas", lastOpened: NOW - 31 * DAY, last30: { opens: 0, minutes: 5 }, allTime: { opens: 1, minutes: 5 } },
      { view: "retired-view", lastOpened: NOW - 3 * DAY, last30: { opens: 1, minutes: 0 }, allTime: { opens: 1, minutes: 0 } },
    ]);
  });
});

describe("the report", () => {
  it("prints a row per view and names the frozen views unopened for 30 days", () => {
    const summary = summarizeUsage(
      [{ view: "orbits", opened: NOW - DAY, at: NOW - DAY, seconds: 90 }],
      ["orbits", "river", "reciprocity"],
      NOW,
    );
    const text = usageReport(summary, NOW - 40 * DAY, NOW);
    expect(text.split("\n")[0]).toMatch(/^View\s+Last opened\s+Last 30 days\s+All time$/);
    expect(text).toMatch(/Orbits 2D\s+27 Sept 2026 \(yesterday\)\s+1 open, 1\.5 min\s+1 open, 1\.5 min/);
    expect(text).toMatch(/Reciprocity \(frozen\)\s+never\s+0 opens, 0 min\s+0 opens, 0 min/);
    expect(text).toContain(
      "Not opened in the last 30 days: The river, Reciprocity. Propose removing them to you; remove nothing without a yes.",
    );
  });

  it("says to wait while there is less than 30 days of usage to go on", () => {
    const text = usageReport(summarizeUsage([], ["orbits"], NOW), NOW - 3 * DAY, NOW);
    expect(text).toContain("wait until 25 Oct 2026 before proposing any view for removal");
    expect(usageReport(summarizeUsage([], ["orbits"], NOW), null, NOW)).toContain("No usage recorded yet.");
  });

  it("runs as npm run usage on a data directory", async () => {
    await recordUsage(usageFile(dataDir), { view: "river", opened: Date.now() - 1000, seconds: 0 });
    const { stdout } = await promisify(execFile)(process.execPath, ["--no-warnings", new URL("./usage-report.ts", import.meta.url).pathname, dataDir]);
    expect(stdout).toContain(`View usage on this Mac, from ${usageFile(dataDir)}:`);
    expect(stdout).toMatch(/The river \(frozen\)\s+\S+ \S+ \S+ \(today\)\s+1 open, 0 min/);
  });
});
