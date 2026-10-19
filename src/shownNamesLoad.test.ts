// @vitest-environment happy-dom
// Loading whom No name except… names (useShownNames, shownNames.ts): those picked as soon as they are in, then with
// their connections once the map's links are; nothing at all while another choice is on.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeopleListing, PersonSummary, RelationshipsReport } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { nameStyleStore, NOBODY } from "./names.ts";
import { useShownNames } from "./shownNames.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The map: 1 to 4 on it; 1 shares a group chat with 2, and 3 one with 4. */
const map = {
  generatedAt: 0, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
  people: [1, 2, 3, 4].map((id) => ({ id })),
  groups: [
    { id: 1, memberIds: [1, 2], selfOnly: false, messageCount: 2, lastMessageAt: 1, months: [] },
    { id: 2, memberIds: [3, 4], selfOnly: false, messageCount: 2, lastMessageAt: 1, months: [] },
  ],
} as unknown as RelationshipsReport;

function Page() {
  useShownNames(true);
  return null;
}

let host: HTMLDivElement;
let root: Root;
let showLinks: () => void;
let people: ReturnType<typeof vi.fn>;
let relationships: ReturnType<typeof vi.fn>;

beforeEach(() => {
  people = vi.fn(async () => ({ people: [{ id: 1, tags: ["show-name"] } as PersonSummary], me: null, tags: [] }) as unknown as PeopleListing);
  relationships = vi.fn(() => new Promise<RelationshipsReport>((resolve) => (showLinks = () => resolve(map))));
  provideArchive({ people, relationships } as unknown as ArchiveApi);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  nameStyleStore.set("full");
  nameStyleStore.setNamed(NOBODY);
});

describe("useShownNames", () => {
  it("names those picked once they are in, and their connections with them once the map's links are", async () => {
    nameStyleStore.set("except");
    await act(async () => root.render(createElement(Page)));
    expect([...nameStyleStore.named()]).toEqual([1]);
    await act(async () => showLinks());
    expect([...nameStyleStore.named()].sort()).toEqual([1, 2]);
  });

  it("loads nothing while another choice is on", async () => {
    nameStyleStore.set("full");
    await act(async () => root.render(createElement(Page)));
    expect(people).not.toHaveBeenCalled();
    expect(relationships).not.toHaveBeenCalled();
    expect(nameStyleStore.named()).toBe(NOBODY);
  });
});
