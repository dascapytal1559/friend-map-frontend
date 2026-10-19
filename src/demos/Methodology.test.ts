import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../settings.ts";
import { curvePoints } from "./Curve.tsx";
import { DECISIONS } from "./decisions.ts";
import { Methodology, PARTS, SETTING_ROWS } from "./Methodology.tsx";
import type { DemoModel } from "./model.ts";

function page(settings: Settings = DEFAULT_SETTINGS, demo = false, shown = 0): string {
  const model = { settings, people: Array.from({ length: shown }, (_, id) => ({ id })), archivedCount: 0, hiddenCount: 0 } as unknown as DemoModel;
  return renderToStaticMarkup(createElement(Methodology, { model, onClose: () => {}, demo }));
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"');

/** Each curve's accessible label in `html`, and the names of the points marked on it. */
function curves(html: string): Array<{ label: string; marks: string[] }> {
  return [...html.matchAll(/<svg class="method__curve"[^>]*aria-label="([^"]*)".*?<\/svg>/gs)].map(([svg, label]) => ({
    label: text(label),
    marks: [...svg.matchAll(/<g class="method__curve-mark">.*?<text[^>]*>(.*?)<\/text>/gs)].map(([, mark]) => text(mark)),
  }));
}

/** The body of one part. */
function part(html: string, id: string): string {
  const start = html.indexOf(`method__part--${id}"`);
  const end = html.indexOf("</details>", start);
  expect(start, id).toBeGreaterThan(-1);
  return html.slice(start, end);
}

/** The body rows of the first table with exactly this class (or the `nth`), each as its cells' text. */
function rows(html: string, className: string, nth = 0): string[][] {
  const table = [...html.matchAll(new RegExp(`<table class="${className}">.*?</table>`, "gs"))][nth]?.[0] ?? "";
  const body = table.match(/<tbody>(.*)<\/tbody>/s)?.[1] ?? "";
  return [...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map(([, row]) => [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map(([, cell]) => text(cell).trim()));
}

describe("Methodology", () => {
  it("opens at a glance: the sum in tiles, then every part closed to its title and one line", () => {
    const html = page();
    expect(html).toMatch(/<figure class="method__glance"/);
    const tiles = [...html.matchAll(/<span class="method__tile-title">([^<]+)</g)].map((m) => m[1]);
    expect(tiles).toEqual(["Messages", "Time together", "Fading", "Closeness"]);
    const parts = [...html.matchAll(/<details class="method__part method__part--(\w+)"( open)?/g)];
    expect(parts.map((m) => m[1])).toEqual([...PARTS]);
    expect(parts.every((m) => m[2] === undefined)).toBe(true);
    const summaries = [...html.matchAll(/<summary><span class="method__title">[^<]+<\/span><span class="method__summary">(.+?)<\/span><\/summary>/g)];
    expect(summaries).toHaveLength(PARTS.length);
    for (const [, summary] of summaries) expect(text(summary).length).toBeGreaterThan(10);
  });

  it("puts the hour's worth up front, at the current setting", () => {
    expect(text(page())).toContain("1 hour = 50 messages");
    expect(text(page())).toContain("An hour together counts as 50 messages, in person or by call.");
    const changed = text(page({ ...DEFAULT_SETTINGS, catchUpHourWorth: 80, closenessHalfLifeDays: 60 }));
    expect(changed).toContain("1 hour = 80 messages");
    expect(changed).toContain("2 hours, one friend160 messages");
    expect(changed).toContain("a 30-minute call40 messages");
    expect(changed).toContain("3 hours, 3 people160 messages each");
    expect(changed).toContain("3 hours, a friend and 2 others160 messages for the friend");
    expect(changed).toContain("a 4-minute call0, too short");
    expect(changed).toContain("counts half after 60 days");
    expect(changed).toContain("Why 50:");
  });

  it("credits each side of a group by the other's share: the formula, then the worked example as number rows", () => {
    const html = page();
    const messages = part(html, "messages");
    expect(text(messages)).toContain("(theirs × your share + yours × their share) ÷ others");
    expect(text(messages)).toContain("Your side only×2Discord keeps only what you sent, so each of yours counts for a reply too");
    expect(rows(messages, "method__rows method__rows--example", 1)).toEqual([
      ["chatty", "200 (20%)", "(200 × 20% + 200 × 20%) ÷ 4", "= 20"],
      ["quiet", "50 (5%)", "(50 × 20% + 200 × 5%) ÷ 4", "= 5"],
      ["silent", "0", "(0 × 20% + 200 × 0%) ÷ 4", "= 0"],
    ]);
  });

  it("weighs a month's direct messages by their balance: the formula, its curve and worked months, at the setting now", () => {
    const messages = part(page(), "messages");
    expect(text(messages)).toContain("a month = 2√(yours × theirs)");
    expect(text(messages)).toContain("Direct2√(yours × theirs)a month's messages between you, by how evenly you both wrote");
    expect(rows(messages, "method__rows method__rows--example")).toEqual([
      ["50 / 50", "2√(50 × 50)", "= 100"],
      ["90 / 10", "2√(90 × 10)", "= 60"],
      ["99 / 1", "2√(99 × 1)", "= 20"],
      ["100 / 0", "2√(100 × 0)", "= 0"],
    ]);
    expect(curves(messages)).toEqual([{
      label: "What a month of 100 direct messages counts, by your share of them: 100 at an even half, 60 at 10 or 90, 0 when one side writes them all",
      marks: ["100/0: 0", "50/50: 100", "10/90: 60"],
    }]);
    expect(text(messages)).toContain("Each month on its own, before fading");
    expect(text(messages)).toContain("messageReciprocity");

    // Half way, the formula blends the two, and the curve and the months move with it.
    const half = part(page({ ...DEFAULT_SETTINGS, messageReciprocity: 0.5 }), "messages");
    expect(text(half)).toContain("a month = 0.5 × (yours + theirs) + 0.5 × 2√(yours × theirs)");
    expect(rows(half, "method__rows method__rows--example")).toEqual([["50 / 50", "= 100"], ["90 / 10", "= 80"], ["99 / 1", "= 60"], ["100 / 0", "= 50"]]);
    expect(curves(half)[0].marks).toEqual(["100/0: 50", "50/50: 100", "10/90: 80"]);
    expect(text(half)).toContain("balance weighs a month's direct messages 0.5 of 1 (default 1)");

    // Off, every message counts 1 again.
    const off = text(page({ ...DEFAULT_SETTINGS, messageReciprocity: 0 }));
    expect(off).toContain("1 for each direct message, a share of each group one.");
    expect(off).toContain("reciprocity is off: every message counts 1");
  });

  it("draws every rule that is a function as a curve, from the settings now", () => {
    const html = page(DEFAULT_SETTINGS, false, 700);
    expect(curves(part(html, "time"))).toEqual([{
      label: "What a day's calls count, by how long they ran: nothing under 5 minutes, then 50 messages an hour",
      marks: ["from 5 min: 4.2", "30 min: 25", "1 hour: 50", "2 hours: 100"],
    }, {
      label: "Each one's share of the time, by how many were there besides you: 75% with 2, 63% with 4, 56% with 9, 52% with 25",
      marks: ["2: 75%", "4: 63%", "9: 56%", "25: 52%"],
    }, {
      label: "What a trip with one friend counts, by how many whole days it ran: 529 for 1 day, 748 for 2 days, 1,183 for 5 days, 1,673 for 10 days, 2,898 for 30 days",
      marks: ["1 day: 529", "2 days: 748", "5 days: 1,183", "10 days: 1,673", "30 days: 2,898"],
    }]);
    expect(curves(part(html, "fading"))).toEqual([{
      label: "What a message counts, by its age: half after 90 days, a quarter after 180 days",
      marks: ["half after 90 days", "a quarter after 180 days"],
    }]);
    expect(curves(part(html, "map"))).toEqual([{
      label: "How far out someone sits by their rank of 700: the closest next to the sun, the long tail sharing the outer part",
      marks: ["closest 10: 25% out", "closest 100: 65% out"],
    }]);

    const changed = page({ ...DEFAULT_SETTINGS, closenessHalfLifeDays: 365, catchUpHourWorth: 80, callMinimumMinutes: 30 });
    expect(curves(part(changed, "time"))[0].marks).toEqual(["from 30 min: 40", "1 hour: 80", "2 hours: 160"]);
    expect(curves(part(changed, "fading"))[0].marks).toEqual(["half after 1 year", "a quarter after 2 years"]);
    // Nobody shown, no ranks to draw.
    expect(curves(part(changed, "map"))).toEqual([]);
  });

  it("draws a curve through its points, either side of any jump", () => {
    const points = curvePoints({ f: (m) => (m < 5 ? 0 : m), breaks: [5] }, { min: 0, max: 120 });
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([120, 120]);
    const jump = points.findIndex(([x]) => x === 5);
    expect(points[jump - 1][1]).toBe(0);
    expect(points[jump][1]).toBe(5);
  });

  it("ends a line short where it is told to, at that point", () => {
    const points = curvePoints({ f: (d) => 2 * d, to: 4.3 }, { min: 0, max: 30 });
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([4.3, 8.6]);
    expect(points.every(([x]) => x <= 4.3)).toBe(true);
  });

  it("shows fading as a table of ages, at the half-life", () => {
    const weights = (settings: Settings) => rows(part(page(settings), "fading"), "method__fade").map(([age, weight]) => [age, weight]);
    expect(weights(DEFAULT_SETTINGS)).toEqual([
      ["today", "1"],
      ["3 months old", "1/2"],
      ["6 months old", "1/4"],
      ["1 year old", "about 1/17"],
      ["2 years old", "about 1/280"],
    ]);
    expect(weights({ ...DEFAULT_SETTINGS, closenessHalfLifeDays: 365 }).slice(3)).toEqual([["1 year old", "1/2"], ["2 years old", "1/4"]]);
  });

  it("says on the map that whoever you live with is ranked first, in the sun", () => {
    expect(text(part(page(), "map"))).toContain("Live togethertagged live-together: infinitely close, ranked first whatever their score, in the sun itself");
  });

  it("lays every part out in tables, formulas or steps, with no paragraph longer than two short lines", () => {
    const html = page();
    for (const id of PARTS) {
      const body = part(html, id);
      expect(body, id).toMatch(/<table|class="method__equation|class="method__flow/);
      for (const [, paragraph] of body.matchAll(/<p(?:\s[^>]*)?>(.*?)<\/p>/gs)) expect(text(paragraph).length, `${id}: ${text(paragraph)}`).toBeLessThan(220);
    }
  });

  it("describes every setting, with its value now and its default", () => {
    expect(Object.keys(SETTING_ROWS).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    const html = page({ ...DEFAULT_SETTINGS, callMinimumMinutes: 10 });
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      expect(html).toContain(`<code>${key}</code>`);
    }
    expect(text(html)).toContain("a day's calls count from 10 minutes (default 5)");
    expect(text(html)).toContain("everything counts half after 90 days (the default)");
  });

  it("names nothing gone: no Met, Lives, kinds of catch-up or quick ones, but in the Decision history", () => {
    const html = page();
    const history = html.slice(html.indexOf('method__part--history"'));
    expect(text(html.replace(history, ""))).not.toMatch(/\bMet\b|\bLives\b|quick catch-up|phone catch-up|kind/i);
  });

  it("says an older hangout by call and that day's calls count the longer, never both", () => {
    expect(text(page())).toContain("and the calls you log with Add event, which count as any other call, except that one with several people gives each their share of it, as a hangout does: an hour with three adds 40 minutes to each one's calls that day");
    expect(text(page())).toMatch(/a 1-hour call with 3 people\s*33.33 messages each/);
    expect(text(page())).toContain("Hangoutshours × ");
    expect(text(page())).toContain("By callan older hangout ticked By call may be a call your phone has too, so on its day it and your calls with them count the longer, never both");
  });

  it("shares a group's time half by all, half split, at the setting now, against an equal split", () => {
    const time = part(page(), "time");
    expect(text(time)).toContain("each one's share = 0.5 + 0.5 ÷ n");
    expect(text(time)).toContain("50% of the time is with everyone at once, the rest split equally");
    expect(rows(time, "method__rows method__rows--example", 1)).toEqual([
      ["1", "100%", "150 messages"],
      ["2", "75%", "112.5 messages"],
      ["4", "63%", "93.75 messages"],
      ["9", "56%", "83.33 messages"],
      ["25", "52%", "78 messages"],
    ]);
    expect(text(time)).toContain("everyone at a group hangout or call shares 0.5 of its time (the default)");
    expect(time).toContain("method__curve-line--reference");

    // Trips: the first 8 hours whole, then by their square root.
    expect(text(time)).toContain("hours counted = hours up to 8, then 8 × √(hours ÷ 8)");
    expect(rows(time, "method__rows method__rows--example", 2)).toEqual([
      ["1 whole day, 14 hours", "700", "529 messages"],
      ["2 whole days, 28 hours", "1,400", "748 messages"],
      ["5 whole days, 70 hours", "3,500", "1,183 messages"],
      ["10 whole days, 140 hours", "7,000", "1,673 messages"],
      ["30 whole days, 420 hours", "21,000", "2,898 messages"],
    ]);
    expect(text(time)).toMatch(/10 whole days away, one friend \(14 hours a day\)\s*1,673 messages, 167 a day/);
    expect(text(time)).toContain("a trip's time together counts whole for 8 hours (the default)");
    // Its curve marks the table's trips, and every hour whole (dashed) leaves the top after 4.3 days.
    const tripCurve = curves(time)[2];
    expect(tripCurve.marks.map((mark) => mark.replace(/^.*: /, "") + " messages")).toEqual(rows(time, "method__rows method__rows--example", 2).map((row) => row[2]));
    expect(text(time)).toContain("every hour whole, off the top");
    expect(text(time)).toContain("every hour whole (dashed) leaves the chart after 4.3 days; 30 days would count 21,000");
    // Whole for a day: the curve and its marks move with the setting.
    const day = part(page({ ...DEFAULT_SETTINGS, tripFullHours: 24 }), "time");
    expect(curves(day)[2].marks).toEqual(["1 day: 700", "2 days: 1,296", "5 days: 2,049", "10 days: 2,898", "30 days: 5,020"]);
    expect(text(day)).toContain("leaves the chart after 7.9 days");
    // Every trip whole, at a year of days: the curve is the straight line, and no dashed one beside it.
    const whole = part(page({ ...DEFAULT_SETTINGS, tripFullHours: 8784 }), "time");
    expect(rows(whole, "method__rows method__rows--example", 2).map((row) => row[2])).toEqual(
      ["700 messages", "1,400 messages", "3,500 messages", "7,000 messages", "21,000 messages"],
    );
    expect(curves(whole)[2].marks).toEqual(["1 day: 700", "2 days: 1,400", "5 days: 3,500", "10 days: 7,000", "30 days: 21,000"]);
    const svgs = (html: string) => html.match(/<svg class="method__curve".*?<\/svg>/gs) ?? [];
    expect(svgs(time)[2]).toContain("method__curve-line--reference");
    expect(svgs(whole)[2]).not.toContain("method__curve-line--reference");
    expect(text(whole)).not.toContain("every hour whole (dashed)");

    // Nothing shared: an equal split, and no dashed line beside it.
    const equal = part(page({ ...DEFAULT_SETTINGS, groupSharedPart: 0 }), "time");
    expect(text(equal)).toContain("each one's share = 0 + 1 ÷ n");
    expect(rows(equal, "method__rows method__rows--example", 1).map((row) => row[1])).toEqual(["100%", "50%", "25%", "11%", "4%"]);
    expect(curves(equal)[1].marks).toEqual(["2: 50%", "4: 25%", "9: 11%", "25: 4%"]);
    // The dashed lines left are the calls' and Trips'.
    expect(equal.match(/method__curve-line--reference/g)).toHaveLength(2);
    expect(text(equal)).toMatch(/a 1-hour call with 3 people\s*16.67 messages each/);
  });

  it("keeps a Decision history, newest first: each with its question, options, comparison, the user's words and what changed", () => {
    const history = part(page(), "history");
    const entries = [...history.matchAll(/<article class="method__decision">(.*?)<\/article>/gs)].map(([, entry]) => entry);
    expect(entries).toHaveLength(DECISIONS.length);
    entries.forEach((entry, i) => {
      const decision = DECISIONS[i];
      expect(entry).toContain(`<time dateTime="${decision.day}">`);
      expect(text(entry)).toContain(decision.title);
      expect(text(entry)).toContain(`Question${decision.question}`);
      expect(text(entry)).toContain(`Decided${decision.decided}`);
      expect(text(entry)).toContain(`Changed${decision.changed}`);
      expect(rows(entry, "method__rows").map((row) => row[0])).toEqual(decision.options.map((o) => (o.chosen ? `${o.name} chosen` : o.name)));
      decision.compared.forEach((table, k) => expect(rows(entry, "method__rows method__rows--example", k)).toEqual(table.rows));
    });
    // The group share was decided from this table.
    const share = entries[DECISIONS.findIndex((d) => d.title === "Sharing a group's time")];
    expect(rows(share, "method__rows method__rows--example")).toEqual([
      ["1", "100%", "100%", "100%"],
      ["2", "50%", "75%", "71%"],
      ["4", "25%", "63%", "50%"],
      ["9", "11%", "56%", "33%"],
      ["25", "4%", "52%", "20%"],
    ]);
    expect(text(share)).toContain("Half shared, ½ + ½ ÷ n chosen");
    expect(text(share)).toContain("Presence bonus");
  });

  it("says the demo keeps the defaults", () => {
    expect(text(page(DEFAULT_SETTINGS, true))).toContain("The demo keeps the defaults.");
  });
});
