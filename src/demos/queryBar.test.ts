import { describe, expect, it } from "vitest";
import { SHOWN_LIMIT } from "../archive.ts";
import {
  answered, canGo, initialQueryBar, keyAction, loadQuery, matchCount, QUERY_KEYS, queryBarReducer, saveQuery, tooMany,
  type Filter, type QueryBarAction, type QueryBarState,
} from "./queryBar.ts";

const play = (state: QueryBarState, ...actions: QueryBarAction[]) => actions.reduce(queryBarReducer, state);

const f = (query: string, said = "", note = ""): Filter => ({ query, said, note });
const SQL = "SELECT person_id FROM person_platform WHERE platform = 'discord' AND direct_from_me > 10";
const DISCORD = f(SQL, "people on Discord I've sent more than 10 messages to");

describe("the Query bar", () => {
  it("runs what Generate wrote straight away: the view shows it, the line says how many and what was left out", () => {
    const asked = play(initialQueryBar(""), { type: "transcript", transcript: DISCORD.said }, { type: "generating" });
    expect(asked).toMatchObject({ generating: true, status: null });
    const ran = play(asked, { type: "ran", filter: { ...DISCORD, note: "Not in the query: who are tall." }, count: 12, why: "generate" });
    expect(ran).toMatchObject({
      applied: { query: SQL, said: DISCORD.said },
      transcript: DISCORD.said,
      generating: false,
      status: { kind: "info", text: "12 people match. Not in the query: who are tall.", from: "run" },
    });
    expect(play(asked, { type: "ran", filter: DISCORD, count: 1, why: "generate" }).status?.text).toBe("1 person matches.");
  });

  it("changes nothing when Generate fails or what it wrote does not run, and says why", () => {
    const on = play(initialQueryBar(DISCORD), { type: "transcript", transcript: "the climbers" }, { type: "generating" });
    const failed = play(on, { type: "generateFailed", error: "Codex is not signed in: run codex login" });
    expect(failed).toMatchObject({ generating: false, applied: DISCORD, transcript: "the climbers", status: { kind: "error", from: "generate" }, failed: null });
    const broken = play(on, { type: "failed", filter: f("SELECT person_id FROM peple", "the climbers"), error: "SQL: no such table: peple" });
    expect(broken).toMatchObject({ generating: false, applied: DISCORD, failed: { query: "SELECT person_id FROM peple" }, status: { kind: "error", text: "SQL: no such table: peple" } });
    // Changing the words clears the error, and Esc puts back the words that are showing.
    expect(play(broken, { type: "transcript", transcript: "the climbers!" })).toMatchObject({ failed: null, status: null });
    expect(play(broken, { type: "revert" })).toMatchObject({ transcript: DISCORD.said, failed: null, status: null });
  });

  it("goes back to everyone with ×: no query, no words, nothing failed, and no Undo", () => {
    const on = play(initialQueryBar(""), { type: "ran", filter: DISCORD, count: 12, why: "generate" });
    const cleared = play(on, { type: "ran", filter: f(""), count: 0, why: "clear" });
    expect(cleared).toEqual({ ...initialQueryBar(""), status: { kind: "info", text: "Cleared: everyone shows.", from: "clear" } });
    expect(cleared).not.toHaveProperty("undo");
  });

  it("runs the query again as people change, refreshing only a line the last run wrote, never the words", () => {
    const ran = play(initialQueryBar(""), { type: "ran", filter: DISCORD, count: 5, why: "generate" }, { type: "transcript", transcript: "half typed" });
    expect(play(ran, { type: "ran", filter: DISCORD, count: 6, why: "again" })).toMatchObject({ transcript: "half typed", status: { text: "6 people match." } });
    // The page opening with a query from before says nothing until asked.
    expect(play(initialQueryBar(DISCORD), { type: "ran", filter: DISCORD, count: 6, why: "again" }).status).toBeNull();
    const failed = play(ran, { type: "generateFailed", error: "the model is busy" });
    expect(play(failed, { type: "ran", filter: DISCORD, count: 6, why: "again" })).toBe(failed);
    // A query that no longer runs says so, whatever the line said.
    expect(play(failed, { type: "failed", filter: DISCORD, error: "SQL: no such column: x" }).status).toMatchObject({ kind: "error", from: "run" });
  });

  it("opens with the words of the query that ran, and none for an older page's query without them", () => {
    expect(initialQueryBar(DISCORD)).toMatchObject({ transcript: DISCORD.said, applied: DISCORD });
    expect(initialQueryBar("met:toowoomba")).toMatchObject({ transcript: "", applied: f("met:toowoomba") });
  });

  it("lets the go button be pressed only with words in the box, and not while Generate waits", () => {
    const empty = initialQueryBar("");
    expect(canGo(empty)).toBe(false);
    expect(canGo({ ...empty, transcript: " \n " })).toBe(false);
    expect(canGo({ ...empty, transcript: "the climbers" })).toBe(true);
    expect(canGo({ ...empty, transcript: "the climbers", generating: true })).toBe(false);
  });

  it("generates on Enter, keeps Shift and Enter a new line, and Esc puts back the words that are showing", () => {
    const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });
    const typed = { ...initialQueryBar(DISCORD), transcript: "the climbers" };
    expect(keyAction(typed, key("Enter"))).toBe("go");
    expect(keyAction(typed, key("Enter", true))).toBeNull();
    // Enter with nothing to press does nothing, and never makes a new line.
    expect(keyAction(initialQueryBar(""), key("Enter"))).toBe("none");
    expect(keyAction({ ...typed, generating: true }, key("Enter"))).toBe("none");
    expect(keyAction(typed, key("Escape"))).toBe("revert");
    expect(keyAction(initialQueryBar(DISCORD), key("Escape"))).toBeNull();
    expect(keyAction(typed, key("a"))).toBeNull();
  });

  it("counts people plainly", () => {
    expect(matchCount(0)).toBe("0 people match");
    expect(matchCount(1)).toBe("1 person matches");
    expect(matchCount(12345)).toBe("12,345 people match");
  });

  it("remembers the query that ran with its words, the map's and the Table's apart, and copes without storage", () => {
    const kept = new Map<string, string>();
    const storage = () => ({ getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) });
    saveQuery(QUERY_KEYS.map, DISCORD, storage);
    expect(loadQuery(QUERY_KEYS.map, storage)).toEqual(DISCORD);
    expect(kept.get("friend-map.query")).toBe(SQL);
    expect(loadQuery(QUERY_KEYS.table, storage)).toEqual(f(""));
    // An older page kept only the query.
    kept.set("friend-map.table.query", "met:toowoomba");
    expect(loadQuery(QUERY_KEYS.table, storage)).toEqual(f("met:toowoomba"));
    const broken = () => {
      throw new Error("blocked");
    };
    expect(loadQuery(QUERY_KEYS.map, broken)).toEqual(f(""));
    expect(() => saveQuery(QUERY_KEYS.map, DISCORD, broken)).not.toThrow();
  });
});

describe("the count under Hide", () => {
  const result = (matched: number, shown: number) => ({ ids: Array.from({ length: matched }, (_, i) => i), shown });

  it("says how many show after Hide as it is when the query runs, never how many Hide left out, on the Table and the map", () => {
    for (const limit of [undefined, SHOWN_LIMIT]) {
      const ran = play(initialQueryBar(""), answered(DISCORD, result(35, 32), limit, "generate"));
      expect(ran.status?.text).toBe("32 people match.");
    }
    const noted = play(initialQueryBar(""), answered({ ...DISCORD, note: "Not in the query: who are tall." }, result(5, 4), undefined, "generate"));
    expect(noted.status?.text).toBe("4 people match. Not in the query: who are tall.");
  });

  it("leaves the line as it was when Hide changes later", () => {
    const ran = play(initialQueryBar(""), answered(DISCORD, result(35, 32), undefined, "generate"));
    // Archive unticked: the query is counted again under the new Hide, and the line keeps its count.
    const after = play(ran, { type: "hide" }, answered(DISCORD, result(35, 35), undefined, "hide"));
    expect(after).toEqual(ran);
    // A query refused under the old Hide that runs under the new one says its count under the new.
    const refused = play(ran, { type: "refused", filter: f("SELECT person_id FROM people"), count: 2_000, limit: SHOWN_LIMIT });
    const fits = play(refused, answered(f("SELECT person_id FROM people"), result(2_000, 900), SHOWN_LIMIT, "hide"));
    expect(fits.status?.text).toBe("900 people match.");
  });
});

describe("the map's limit", () => {
  const result = (matched: number, shown: number) => ({ ids: Array.from({ length: matched }, (_, i) => i), shown });

  it("refuses a query that would show more than the limit after Hide, and lets the limit itself through", () => {
    expect(SHOWN_LIMIT).toBe(1_000);
    // Everyone archived shown: twenty thousand people.
    expect(answered(f(""), result(20_228, 20_120), SHOWN_LIMIT, "clear")).toEqual({ type: "refused", filter: f(""), count: 20_120, limit: SHOWN_LIMIT });
    // Counted after Hide: many matches, few shown, runs.
    expect(answered(DISCORD, result(5_000, 1_000), SHOWN_LIMIT, "generate")).toEqual({ type: "ran", filter: DISCORD, count: 1_000, why: "generate" });
    expect(answered(DISCORD, result(1_001, 1_001), SHOWN_LIMIT, "generate").type).toBe("refused");
    // The Table has no limit.
    expect(answered(f(""), result(20_228, 20_228), undefined, "clear").type).toBe("ran");
  });

  it("says why, keeps what the view shows, and stays red until the words or Hide change", () => {
    const ran = play(initialQueryBar(DISCORD), { type: "ran", filter: DISCORD, count: 5, why: "generate" });
    const everyone = f("SELECT person_id FROM people", "everyone, archived too");
    const refused = play(ran, { type: "transcript", transcript: everyone.said }, { type: "generating" }, { type: "refused", filter: everyone, count: 1_234, limit: SHOWN_LIMIT });
    expect(tooMany(1_234, SHOWN_LIMIT)).toBe("1,234 people match; ask for fewer or hide more in the Table: the limit is 1,000.");
    expect(refused).toMatchObject({
      applied: DISCORD,
      transcript: everyone.said,
      generating: false,
      failed: everyone,
      status: { kind: "error", text: tooMany(1_234, SHOWN_LIMIT), from: "run" },
    });
    // The words changing, Hide changing, or a query running clears it.
    expect(play(refused, { type: "transcript", transcript: "the climbers" })).toMatchObject({ failed: null, status: null });
    expect(play(refused, { type: "hide" })).toMatchObject({ failed: null, status: null, transcript: everyone.said });
    expect(play(refused, { type: "ran", filter: everyone, count: 800, why: "hide" })).toMatchObject({ failed: null, applied: everyone });
    expect(play(refused, { type: "ran", filter: f(""), count: 0, why: "clear" }).failed).toBeNull();
    // Hide changing with nothing failed leaves the line as it is.
    expect(play(ran, { type: "hide" })).toBe(ran);
  });

  it("keeps a refusal while the query that ran is run again as people change, and clears it when that query is the one refused", () => {
    const refused = play(initialQueryBar(DISCORD), { type: "refused", filter: f("SELECT person_id FROM people"), count: 2_000, limit: SHOWN_LIMIT });
    expect(play(refused, { type: "ran", filter: DISCORD, count: 6, why: "again" })).toBe(refused);
    // Refused on opening (Hide remembered with archive unticked), then under the limit as people change.
    const opened = play(initialQueryBar(""), { type: "refused", filter: f(""), count: 20_000, limit: SHOWN_LIMIT });
    expect(play(opened, { type: "ran", filter: f(""), count: 900, why: "again" })).toMatchObject({ failed: null, status: null });
  });
});
