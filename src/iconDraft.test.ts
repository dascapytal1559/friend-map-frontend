import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonSummary } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { changeChip } from "./changeChip.ts";
import { currentHue, drafted, draftHue, NEW_COLOUR_MIN_TURN, newColour, newPicture, recolour, saveDraft, startDraft } from "./iconDraft.ts";
import { isIdenticonSeed } from "./identicon.ts";

const SEED = "0123456789abcdef";
const ada = { id: 7, name: "Ada Sample", aliases: [], identiconSeed: SEED, identiconHue: null } as unknown as PersonSummary;

let api: { setIdenticon: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", new EventTarget());
  api = {
    setIdenticon: vi.fn(async (_id: number, seed: string, hue: number | null) => ({ person: { ...ada, identiconSeed: seed, identiconHue: hue }, changeset: 95 })),
  };
  provideArchive(api as unknown as ArchiveApi);
});

afterEach(() => {
  changeChip.dismiss();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the icon picker's draft", () => {
  it("starts as they are, and saving it as it is changes nothing", async () => {
    const draft = startDraft(ada);
    expect(draft).toEqual({ seed: SEED, hue: null });
    expect(drafted(ada, draft)).toBeNull();
    expect(await saveDraft(ada, draft)).toBeNull();
    expect(api.setIdenticon).not.toHaveBeenCalled();
  });

  it("is only a draft while it is drafted: recolouring and rerolling save nothing", () => {
    let draft = recolour(startDraft(ada), 200);
    draft = newColour(draft);
    draft = newPicture(draft);
    expect(drafted(ada, draft)).toBe("colour");
    expect(api.setIdenticon).not.toHaveBeenCalled();
    expect(changeChip.all()).toEqual([]);
  });

  it("changes only the colour when one is picked or slid to, keeping the picture", () => {
    const picked = recolour(startDraft(ada), 200);
    expect(picked).toEqual({ seed: SEED, hue: 200 });
    expect(recolour(picked, 130)).toEqual({ seed: SEED, hue: 130 });
    expect(drafted(ada, picked)).toBe("colour");
  });

  it("gives a new colour clearly different from the draft's, keeping the picture", () => {
    for (const random of [0, 0.25, 0.5, 0.999]) {
      const rerolled = newColour({ seed: "1111111111111111", hue: 350 }, random);
      expect(rerolled.seed).toBe("1111111111111111");
      expect(Number.isInteger(rerolled.hue) && rerolled.hue! >= 0 && rerolled.hue! < 360).toBe(true);
      const apart = Math.abs(rerolled.hue! - 350);
      expect(Math.min(apart, 360 - apart)).toBeGreaterThanOrEqual(NEW_COLOUR_MIN_TURN);
    }
    // From the seed's own colour too.
    const own = newColour(startDraft(ada), 0);
    expect(own.seed).toBe(SEED);
    expect(own.hue).toBe((currentHue(ada) + NEW_COLOUR_MIN_TURN) % 360);
  });

  it("refreshes to a new picture in the draft's colour, the seed's own kept as it looks", () => {
    expect(newPicture({ seed: "1111111111111111", hue: 200 }, "2222222222222222")).toEqual({ seed: "2222222222222222", hue: 200 });
    // Their own seed's colour, pinned, so a new picture does not bring a new colour with it.
    const refreshed = newPicture(startDraft(ada), "2222222222222222");
    expect(refreshed).toEqual({ seed: "2222222222222222", hue: currentHue(ada) });
    expect(draftHue(refreshed)).toBe(currentHue(ada));
    expect(drafted(ada, refreshed)).toBe("picture");
  });

  it("saves as exactly one change, seed and colour together, with one chip", async () => {
    const draft = newPicture(recolour(startDraft(ada), 240));
    expect(await saveDraft(ada, draft)).toMatchObject({ identiconSeed: draft.seed, identiconHue: 240 });
    expect(api.setIdenticon).toHaveBeenCalledTimes(1);
    expect(api.setIdenticon).toHaveBeenCalledWith(7, draft.seed, 240);
    expect(changeChip.all()).toMatchObject([{ what: { kind: "identicon", who: { id: 7 }, done: "colour" }, changeset: 95 }]);
  });

  it("is a new icon, not a new colour, when only the picture changed", async () => {
    const pinned = { ...ada, identiconHue: 200 };
    await saveDraft(pinned, newPicture(startDraft(pinned)));
    expect(changeChip.get()).toMatchObject({ what: { done: "picture" } });
  });
});
