import { describe, expect, it } from "vitest";
import { createUsageTracker, NEW_VISIT_AFTER_MS, type UsageReport } from "./usage.ts";

function setup() {
  let now = 1_000_000;
  const reports: UsageReport[] = [];
  const tracker = createUsageTracker((report) => reports.push(report), () => now);
  return { tracker, reports, advance: (ms: number) => (now += ms), now: () => now };
}

describe("the usage tracker", () => {
  it("reports a visit when a view is shown, then only the time it stays visible", () => {
    const { tracker, reports, advance } = setup();
    tracker.show("orbits");
    const opened = reports[0].opened;
    expect(reports).toEqual([{ view: "orbits", opened, seconds: 0 }]);
    advance(60_000);
    tracker.flush();
    advance(20_000);
    tracker.hide();
    // Hidden time does not count.
    advance(10 * 60_000);
    tracker.flush();
    tracker.show("orbits");
    advance(5_000);
    tracker.hide();
    expect(reports).toEqual([
      { view: "orbits", opened, seconds: 0 },
      { view: "orbits", opened, seconds: 60 },
      { view: "orbits", opened, seconds: 20 },
      { view: "orbits", opened, seconds: 5 },
    ]);
  });

  it("counts a new visit when a view comes back after half an hour hidden, or another view is shown", () => {
    const { tracker, reports, advance } = setup();
    tracker.show("orbits");
    tracker.hide();
    advance(NEW_VISIT_AFTER_MS + 1);
    tracker.show("orbits");
    tracker.hide();
    tracker.show("river");
    const opens = reports.filter((r) => r.seconds === 0);
    expect(opens.map((r) => r.view)).toEqual(["orbits", "orbits", "river"]);
    expect(opens[1].opened).toBeGreaterThan(opens[0].opened);
  });

  it("treats a view remounted at once, or shown twice, as the same visit", () => {
    const { tracker, reports } = setup();
    tracker.show("canvas");
    tracker.show("canvas");
    tracker.hide();
    tracker.hide();
    tracker.show("canvas");
    expect(reports).toEqual([{ view: "canvas", opened: reports[0].opened, seconds: 0 }]);
  });
});
