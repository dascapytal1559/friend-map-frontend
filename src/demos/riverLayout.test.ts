import { describe, expect, it } from "vitest";
import { insideOut, layoutRiver, niceBar, placeLabels, smooth, streamAt, type StreamInput } from "./riverLayout.ts";

const flat = (n: number, months = 6) => new Array<number>(months).fill(n);

describe("smooth", () => {
  it("samples every month perMonth times and keeps a constant series constant", () => {
    const out = smooth([4, 4, 4], 5);
    expect(out).toHaveLength(11);
    for (const v of out) expect(v).toBeCloseTo(4);
  });

  it("never dips below zero or rises above the peak, and tapers a lone month", () => {
    const out = smooth([0, 0, 12, 0, 0], 4);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out)).toBeLessThanOrEqual(12);
    expect(out[8]).toBeCloseTo(8); // the peak month: (0 + 4·12 + 0) / 6
    expect(out[0]).toBe(0);
    expect(out[16]).toBe(0);
  });

  it("handles empty and single-month series", () => {
    expect(smooth([], 4)).toEqual([]);
    expect(smooth([7], 4)).toEqual([7]);
  });
});

describe("insideOut", () => {
  it("puts the first item in the middle and alternates outwards", () => {
    expect(insideOut([0, 1, 2, 3, 4])).toEqual([3, 1, 0, 2, 4]);
    expect(insideOut([0, 1])).toEqual([1, 0]);
    expect(insideOut([])).toEqual([]);
  });
});

describe("layoutRiver", () => {
  const people: StreamInput[] = [
    { id: 1, series: flat(40), community: 0 },
    { id: 2, series: flat(10), community: 0 },
    { id: 3, series: flat(5), community: 0 },
    { id: 4, series: flat(30), community: 1 },
    { id: 5, series: flat(8), community: -1 },
    { id: 6, series: flat(2), community: -1 },
    { id: 7, series: flat(0), community: 1 },
  ];

  it("leaves out people with no messages and ranks the rest by volume", () => {
    const layout = layoutRiver(people, { height: 300, gap: 0 });
    expect(layout.streams.map((s) => s.id).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(layout.streams.find((s) => s.id === 1)!.rank).toBe(0);
    expect(layout.streams.find((s) => s.id === 6)!.rank).toBe(5);
  });

  it("orders channels inside out with the ungrouped on both banks, each group's biggest at its core", () => {
    const layout = layoutRiver(people, { height: 300, gap: 0 });
    // Group 0 is biggest so sits in the middle, group 1 above it; the ungrouped frame both edges.
    expect(layout.streams.map((s) => s.id)).toEqual([5, 4, 2, 1, 3, 6]);
  });

  it("stacks streams edge to edge around the centre line, the tallest moment exactly the height", () => {
    const layout = layoutRiver(people, { height: 190, gap: 0 });
    const s = 3;
    for (let i = 1; i < layout.streams.length; i++) expect(layout.streams[i].y0[s]).toBeCloseTo(layout.streams[i - 1].y1[s]);
    const first = layout.streams[0].y0[s];
    const last = layout.streams[layout.streams.length - 1].y1[s];
    expect(last - first).toBeCloseTo(190);
    expect(first + last).toBeCloseTo(0);
    expect(layout.scale).toBeCloseTo(190 / 95);
    const one = layout.streams.find((x) => x.id === 1)!;
    expect(one.y1[s] - one.y0[s]).toBeCloseTo(40 * layout.scale);
  });

  it("opens a gap between channels only while both are flowing, and still fits the height", () => {
    const layout = layoutRiver(
      [
        { id: 1, series: [50, 50, 50, 50, 50, 50, 50], community: 0 },
        { id: 2, series: [0, 0, 0, 0, 40, 40, 40], community: 1 },
      ],
      { height: 100, gap: 6, perMonth: 2 },
    );
    const [top, bottom] = layout.streams;
    expect(top.id).toBe(2);
    expect(bottom.y0[0] - top.y1[0]).toBeCloseTo(0);
    expect(bottom.y0[12] - top.y1[12]).toBeCloseTo(6);
    const tallest = Math.max(...bottom.y1.map((y, s) => y - top.y0[s]));
    expect(tallest).toBeCloseTo(100);
  });

  it("copes with nobody to draw", () => {
    const layout = layoutRiver([{ id: 1, series: flat(0), community: 0 }], { height: 100 });
    expect(layout.streams).toEqual([]);
    expect(layout.scale).toBe(0);
  });
});

describe("streamAt", () => {
  const layout = layoutRiver(
    [
      { id: 1, series: flat(50), community: 0 },
      { id: 2, series: flat(1), community: 0 },
    ],
    { height: 102, gap: 0, perMonth: 1 },
  );
  const big = layout.streams.find((s) => s.id === 1)!;
  const thin = layout.streams.find((s) => s.id === 2)!;

  it("finds the stream containing the point", () => {
    expect(streamAt(layout, 2, (big.y0[2] + big.y1[2]) / 2)?.id).toBe(1);
  });

  it("picks a hairline stream from a few pixels away, and nothing over open water", () => {
    expect(thin.y1[2] - thin.y0[2]).toBeLessThan(3);
    expect(streamAt(layout, 2, thin.y0[2] - 3)?.id).toBe(2);
    expect(streamAt(layout, 2, 500)).toBeNull();
  });

  it("clamps samples outside the river", () => {
    expect(streamAt(layout, -5, 0)?.id).toBe(1);
    expect(streamAt(layout, 99, 0)?.id).toBe(1);
  });
});

describe("placeLabels", () => {
  const measure = (text: string, size: number) => text.length * size * 0.5;
  const x = (s: number) => s * 10;

  it("places a name inside its stream at the widest point, clear of the others", () => {
    const layout = layoutRiver(
      [
        { id: 1, series: [10, 20, 60, 60, 60, 20, 10, 10, 10, 10], community: 0 },
        { id: 2, series: flat(40, 10), community: 0 },
      ],
      { height: 200, gap: 0, perMonth: 4 },
    );
    const labels = placeLabels(layout, [{ id: 1, texts: ["Ada"] }, { id: 2, texts: ["Bea"] }], { x, measure });
    expect(labels.map((l) => l.id)).toEqual([1, 2]);
    for (const label of labels) {
      const stream = layout.streams.find((s) => s.id === label.id)!;
      const width = measure(label.text, label.size);
      for (let s = 0; s < layout.samples; s++) {
        if (x(s) < label.x - width / 2 || x(s) > label.x + width / 2) continue;
        expect(stream.y0[s]).toBeLessThanOrEqual(label.y - label.size / 2);
        expect(stream.y1[s]).toBeGreaterThanOrEqual(label.y + label.size / 2);
      }
    }
    const ada = labels[0];
    expect(ada.size).toBe(17);
    expect(ada.x).toBeGreaterThanOrEqual(x(8));
    expect(ada.x).toBeLessThanOrEqual(x(16));
  });

  it("falls back to the short name, then gives up on a stream too thin anywhere", () => {
    const layout = layoutRiver(
      [
        { id: 1, series: flat(100, 4), community: 0 },
        { id: 2, series: flat(20, 4), community: 0 },
        { id: 3, series: flat(1, 4), community: 0 },
      ],
      { height: 121, gap: 0, perMonth: 4 },
    );
    const labels = placeLabels(
      layout,
      [
        { id: 2, texts: ["Bartholomew Longname", "Bart"] },
        { id: 3, texts: ["Cy"] },
      ],
      { x: (s) => s * 5, measure },
    );
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ id: 2, text: "Bart", size: 15 });
  });

  it("keeps labels inside the left and right bounds", () => {
    const layout = layoutRiver([{ id: 1, series: flat(80, 10), community: 0 }], { height: 80, gap: 0, perMonth: 1 });
    const [label] = placeLabels(layout, [{ id: 1, texts: ["Ada"] }], { x, measure, left: 40, right: 90 });
    expect(label.x - measure("Ada", label.size) / 2).toBeGreaterThanOrEqual(40);
    expect(label.x + measure("Ada", label.size) / 2).toBeLessThanOrEqual(90);
  });
});

describe("niceBar", () => {
  it("picks the smallest round count at least 10 pixels wide", () => {
    expect(niceBar(0.22)).toEqual({ messages: 50, px: 11 });
    expect(niceBar(3)).toEqual({ messages: 5, px: 15 });
    expect(niceBar(0)).toEqual({ messages: 0, px: 0 });
  });
});
