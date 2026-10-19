import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Draft } from "./archive.ts";
import type { ArchiveApi } from "./archiveApi.ts";
import { DraftSaver, SAVE_AFTER_MS, type DraftState } from "./drafts.ts";

const draft = (id: number, text: string): Draft => ({ id, personId: 7, text, createdAt: 0, updatedAt: 0 });

describe("saving a draft as it is typed", () => {
  let api: { addDraft: Mock<ArchiveApi["addDraft"]>; setDraft: Mock<ArchiveApi["setDraft"]> };
  let states: DraftState[];

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    api = {
      addDraft: vi.fn<ArchiveApi["addDraft"]>(async (_person, text) => (text.trim() ? draft(40, text.trim()) : null)),
      setDraft: vi.fn<ArchiveApi["setDraft"]>(async (id, text) => (text.trim() ? draft(id, text.trim()) : null)),
    };
  });

  afterEach(() => vi.useRealTimers());

  it("waits for a pause, then saves only the latest text, making the draft with the first and changing it after", async () => {
    const saver = new DraftSaver(7, null, api, (state) => states.push(state));
    saver.type("H");
    saver.type("Hi");
    saver.type("Hi there");
    expect(api.addDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
    expect(api.addDraft).toHaveBeenCalledExactlyOnceWith(7, "Hi there");
    saver.type("Hi there!");
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
    expect(api.setDraft).toHaveBeenCalledExactlyOnceWith(40, "Hi there!");
    expect(states.at(-1)).toEqual({ state: "saved" });
  });

  it("saves at once when flushed (the box left, the panel gone), and not again for the same text", async () => {
    const saver = new DraftSaver(7, draft(5, "Coffee?"), api);
    saver.type("Coffee?  ");
    await saver.flush();
    expect(api.setDraft).not.toHaveBeenCalled();
    saver.type("Coffee on Friday?");
    await saver.flush();
    expect(api.setDraft).toHaveBeenCalledExactlyOnceWith(5, "Coffee on Friday?");
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
    expect(api.setDraft).toHaveBeenCalledTimes(1);
  });

  it("saves one at a time: what is typed during a save is saved after it, to the draft it made", async () => {
    let finish!: (value: Draft) => void;
    api.addDraft.mockImplementationOnce(() => new Promise<Draft>((resolve) => (finish = resolve)));
    const saver = new DraftSaver(7, null, api);
    saver.type("Hi");
    const first = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    saver.type("Hi you");
    const second = saver.flush();
    finish(draft(41, "Hi"));
    await Promise.all([first, second]);
    expect(api.addDraft).toHaveBeenCalledTimes(1);
    expect(api.setDraft).toHaveBeenCalledExactlyOnceWith(41, "Hi you");
  });

  it("emptied, deletes the draft, so the next text makes a new one", async () => {
    const saver = new DraftSaver(7, draft(5, "Coffee?"), api);
    saver.type("");
    await saver.flush();
    expect(api.setDraft).toHaveBeenCalledExactlyOnceWith(5, "");
    saver.type("Lunch?");
    await saver.flush();
    expect(api.addDraft).toHaveBeenCalledExactlyOnceWith(7, "Lunch?");
  });

  it("says when it did not save, and tries again with the next flush", async () => {
    api.setDraft.mockRejectedValueOnce(new Error("the archive is not available"));
    const saver = new DraftSaver(7, draft(5, "Coffee?"), api, (state) => states.push(state));
    saver.type("Coffee soon?");
    await saver.flush();
    expect(states.at(-1)).toEqual({ state: "failed", error: "the archive is not available" });
    await saver.flush();
    expect(api.setDraft).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ state: "saved" });
  });
});
