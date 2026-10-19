// Prints how much each view has been used, from data/usage.jsonl (see usage.ts):
//
//   npm run usage                        the data folder (data/, or FRIEND_MAP_DATA; see dataHome.ts)
//   node server/usage-report.ts <dir>    another data directory
//
// Per view: when it was last opened, and opens and visible minutes in the
// last 30 days and all time. Then which frozen views have not been opened for
// 30 days, to propose to you for removal (never removed without a yes).

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { timeZone } from "../src/time.ts";
import { VIEWS } from "../src/views.ts";
import { dataHome } from "./dataHome.ts";
import { readUsage, summarizeUsage, usageFile, type ViewUsage } from "./usage.ts";

const DAY = 86_400_000;

export function usageReport(summary: ViewUsage[], firstRecordAt: number | null, now: number): string {
  const title = (slug: string) => VIEWS.find((v) => v.slug === slug)?.title ?? slug;
  const rows = summary.map((u) => [
    title(u.view) + (VIEWS.find((v) => v.slug === u.view)?.frozen ? " (frozen)" : ""),
    u.lastOpened === null ? "never" : `${dateLabel(u.lastOpened)} (${ago(now - u.lastOpened)})`,
    amount(u.last30),
    amount(u.allTime),
  ]);
  const table = [["View", "Last opened", "Last 30 days", "All time"], ...rows];
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
  const lines = table.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("   ").trimEnd());
  lines.splice(1, 0, widths.map((w) => "-".repeat(w)).join("   "));

  const unused = summary.filter((u) => VIEWS.find((v) => v.slug === u.view)?.frozen && u.last30.opens === 0).map((u) => title(u.view));
  if (firstRecordAt === null) {
    lines.push("", "No usage recorded yet.");
  } else if (now - firstRecordAt < 30 * DAY) {
    lines.push("", `Usage has been recorded since ${dateLabel(firstRecordAt)}; wait until ${dateLabel(firstRecordAt + 30 * DAY)} before proposing any view for removal.`);
  } else if (unused.length > 0) {
    lines.push("", `Not opened in the last 30 days: ${unused.join(", ")}. Propose removing them to you; remove nothing without a yes.`);
  } else {
    lines.push("", "Every frozen view was opened in the last 30 days.");
  }
  return `${lines.join("\n")}\n`;
}

function amount({ opens, minutes }: { opens: number; minutes: number }): string {
  return `${opens} open${opens === 1 ? "" : "s"}, ${minutes < 10 && minutes > 0 ? minutes.toFixed(1) : Math.round(minutes)} min`;
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: timeZone() });
}

function ago(ms: number): string {
  const days = Math.floor(ms / DAY);
  return days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = resolve(process.argv[2] ?? dataHome().data);
  const file = usageFile(dataDir);
  const records = await readUsage(file);
  const now = Date.now();
  console.log(`View usage on this Mac, from ${file}:\n`);
  process.stdout.write(usageReport(summarizeUsage(records, VIEWS.map((v) => v.slug), now), records.length > 0 ? records.reduce((first, r) => Math.min(first, r.at), Infinity) : null, now));
}
