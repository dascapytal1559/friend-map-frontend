import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveChanged, needsLoad, onArchiveChanged } from "./useArchive.ts";

describe("onArchiveChanged", () => {
  // The page's document, as far as these use it.
  beforeEach(() => void (globalThis.document = new EventTarget() as Document));
  afterEach(() => void Reflect.deleteProperty(globalThis, "document"));

  it("reloads everything when people change, and only what follows messages when just new messages came in", () => {
    const reloaded: string[] = [];
    const stops = [
      onArchiveChanged(() => reloaded.push("people listing")),
      onArchiveChanged(() => reloaded.push("map"), { messages: true }),
    ];
    archiveChanged("messages");
    expect(reloaded).toEqual(["map"]);
    archiveChanged();
    expect(reloaded).toEqual(["map", "people listing", "map"]);
    for (const stop of stops) stop();
    archiveChanged("messages");
    archiveChanged("people");
    expect(reloaded).toHaveLength(3);
  });
});

describe("needsLoad", () => {
  const people = () => Promise.resolve();
  const other = () => Promise.resolve();

  it("loads once while enabled, and again when the load or the archive changes", () => {
    expect(needsLoad(true, null, { load: people, version: 0 })).toBe(true);
    expect(needsLoad(true, { load: people, version: 0 }, { load: people, version: 0 })).toBe(false);
    expect(needsLoad(true, { load: people, version: 0 }, { load: people, version: 1 })).toBe(true);
    expect(needsLoad(true, { load: people, version: 0 }, { load: other, version: 0 })).toBe(true);
  });

  it("loads nothing while disabled, even when the archive changed (the People list while a person is open)", () => {
    expect(needsLoad(false, null, { load: people, version: 0 })).toBe(false);
    expect(needsLoad(false, { load: people, version: 0 }, { load: people, version: 3 })).toBe(false);
  });

  it("once enabled again, loads only if something changed meanwhile", () => {
    expect(needsLoad(true, { load: people, version: 2 }, { load: people, version: 2 })).toBe(false);
    expect(needsLoad(true, { load: people, version: 2 }, { load: people, version: 5 })).toBe(true);
  });
});
