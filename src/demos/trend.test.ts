import { describe, expect, it } from "vitest";
import { trendEnd, trendOf, trendSummary, windowLabel } from "./trend.ts";

const flat = (months: number, value: number) => new Array<number>(months).fill(value);
const ramp = (from: number, to: number, months: number) =>
  Array.from({ length: months }, (_, i) => from + ((to - from) * i) / (months - 1));

describe("trendOf", () => {
  it("fits a straight line through the window's months", () => {
    const trend = trendOf(ramp(10, 32, 12), 11, 12);
    expect(trend.start).toBeCloseTo(10);
    expect(trend.end).toBeCloseTo(32);
    expect(trend.mean).toBeCloseTo(21);
    expect(trend.change).toBeCloseTo(22 / 21);
    expect(trend.kind).toBe("closer");
  });

  it("calls a line that moves by half the average month or more closer or apart, and less steady", () => {
    // Mean 20: a rise or fall of 10 across the window is the threshold.
    expect(trendOf(ramp(15, 25, 12), 11, 12).kind).toBe("closer");
    expect(trendOf(ramp(25, 15, 12), 11, 12).kind).toBe("apart");
    expect(trendOf(ramp(16, 24, 12), 11, 12).kind).toBe("steady");
    expect(trendOf(ramp(24, 16, 12), 11, 12).kind).toBe("steady");
    expect(trendOf(flat(12, 20), 11, 12)).toMatchObject({ kind: "steady", change: 0 });
  });

  it("looks only at the window: the same friendship reads differently over 6 months and 2 years", () => {
    // Two quiet years, then a busy half year that has started to fade.
    const series = [...flat(18, 2), 40, 38, 36, 30, 26, 22];
    expect(trendOf(series, 23, 6).kind).toBe("apart");
    expect(trendOf(series, 23, 24).kind).toBe("closer");
    expect(trendOf(series, 23, 24).counts).toHaveLength(24);
  });

  it("counts months before the first message as none", () => {
    const trend = trendOf([30, 30, 30], 2, 12);
    expect(trend.from).toBe(-9);
    expect(trend.counts).toEqual([...flat(9, 0), 30, 30, 30]);
    expect(trend.kind).toBe("closer");
  });

  it("is too quiet to tell with fewer messages than months", () => {
    expect(trendOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6], 11, 12).kind).toBe("quiet");
    expect(trendOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 6], 11, 12).kind).toBe("closer");
    expect(trendOf([], 11, 12)).toMatchObject({ kind: "quiet", total: 0, change: 0 });
  });

  it("ends the window where it is told to", () => {
    const series = [1, 2, 3, 4, 50];
    expect(trendOf(series, 3, 4).counts).toEqual([1, 2, 3, 4]);
  });
});

describe("trendEnd", () => {
  it("leaves out the month in progress, and nothing in the past", () => {
    expect(trendEnd(29, 30)).toBe(28);
    expect(trendEnd(12, 30)).toBe(12);
  });
});

describe("trendSummary", () => {
  it("says the label and the fitted line's ends, per month", () => {
    expect(trendSummary(trendOf(ramp(8, 21, 12), 11, 12))).toBe("getting closer: 8 → 21 a month");
    expect(trendSummary(trendOf(ramp(4.44, 0.2, 6), 5, 6))).toBe("drifting apart: 4.4 → 0.2 a month");
    expect(trendSummary(trendOf([0, 0, 1], 2, 3))).toBe("too quiet to tell: 1 message");
  });

  it("names long windows in years", () => {
    expect(windowLabel(12)).toBe("12 months");
    expect(windowLabel(18)).toBe("18 months");
    expect(windowLabel(36)).toBe("3 years");
  });
});
