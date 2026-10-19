// The Group chats heading opens and closes its list as the person panel says (closed whenever the panel opens).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PersonGroup } from "./archive.ts";
import { PersonGroups } from "./PersonGroups.tsx";

const groups: PersonGroup[] = [{ id: 3, title: "Book club", platform: "messenger", people: 4, fromThem: 12, fromMe: 9, lastMessageAt: null, namedBy: [], unlinked: false }];
vi.mock("./useArchive.ts", () => ({ useArchive: () => ({ data: groups, unavailable: false, error: null, reload: () => {} }) }));

const list = (open: boolean) =>
  renderToStaticMarkup(createElement(PersonGroups, { person: { id: 6, name: "Ada Smith", aliases: [] }, open, onToggle: () => {}, onOpen: () => {} }));

describe("Group chats", () => {
  it("is the heading alone when closed, and lists them when open", () => {
    expect(list(false)).toContain('aria-expanded="false"><span aria-hidden="true">▸</span> Group chats · 1</button>');
    expect(list(false)).not.toContain("Book club");
    expect(list(true)).toContain('aria-expanded="true"><span aria-hidden="true">▾</span> Group chats · 1</button>');
    expect(list(true)).toContain("Book club");
  });
});
