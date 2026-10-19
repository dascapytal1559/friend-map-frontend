import { describe, expect, it } from "vitest";
import { DECISIONS } from "./decisions.ts";

describe("the Decision history", () => {
  it("is newest first, each on a real day, with a unique title", () => {
    const days = DECISIONS.map((d) => d.day);
    expect(days).toEqual([...days].sort().reverse());
    for (const day of days) expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(day);
    expect(new Set(DECISIONS.map((d) => d.title)).size).toBe(DECISIONS.length);
  });

  it("names one option chosen of several, and compares them on at least one table whose rows fit its head", () => {
    for (const d of DECISIONS) {
      expect(d.options.filter((o) => o.chosen), d.title).toHaveLength(1);
      expect(d.options.length, d.title).toBeGreaterThan(1);
      expect(d.compared.length, d.title).toBeGreaterThan(0);
      for (const table of d.compared) for (const row of table.rows) expect(row, `${d.title}: ${table.caption}`).toHaveLength(table.head.length);
      for (const text of [d.question, d.decided, d.changed]) expect(text.length, d.title).toBeGreaterThan(10);
    }
  });

  it("names only a decision it has as what replaced one, and a newer one", () => {
    for (const d of DECISIONS.filter((d) => d.replacedBy)) {
      const later = DECISIONS.find((e) => e.title === d.replacedBy);
      expect(later, d.title).toBeDefined();
      expect(later!.day >= d.day).toBe(true);
    }
  });

  it("holds the decisions the score rests on", () => {
    expect(DECISIONS.map((d) => d.title)).toEqual(expect.arrayContaining([
      "Sharing a group's time", "Direct messages by their balance", "An hour together is 50 messages", "A call of unknown length counts nothing", "Calls count from 1 minute",
    ]));
  });
});
