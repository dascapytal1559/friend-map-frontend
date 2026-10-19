// On a read-only page (the static demo), every part of the person panel that
// edits shows its value and offers nothing to change it: no box, button or
// switch, where the app's page has them.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PersonSummary } from "./archive.ts";
import { PlaceEditor } from "./PersonFields.tsx";
import { DraftEditor } from "./DraftBox.tsx";
import { NamesField } from "./NameChips.tsx";
import { AccountList, ArchiveButton, JoinPerson, NoteEditor, ReachOutSwitch, TagEditor } from "./PersonParts.tsx";
import { ReadOnly } from "./readOnly.ts";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const person: PersonSummary = {
  id: 1, name: "Ada Sample", aliases: ["Addy"], tags: ["climbing"], note: "Lends good books", noteFromContacts: false, shouldReachOut: true, identiconSeed: "00000000000000a1", identiconHue: null,
  edited: false, untouched: false, archived: "groups-wrote", archiveRule: "groups-wrote", location: "Hobart",
  accounts: [
    { id: 10, platform: "messenger", displayName: "Ada Sample", handle: null, link: "import", messageCount: 5, directMessageCount: 5, groupMessageCount: 0, lastMessageAt: NOW },
    { id: 11, platform: "whatsapp", displayName: "Ada Sample", handle: null, link: "import", messageCount: 2, directMessageCount: 2, groupMessageCount: 0, lastMessageAt: NOW },
  ],
  messageCount: 7, directMessageCount: 7, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: NOW, unknown: false,
  lastByPlatform: [{ platform: "messenger", at: NOW }], joined: null,
};

const parts: Record<string, ReactElement> = {
  names: createElement(NamesField, { person }),
  tags: createElement(TagEditor, { person, suggestions: ["climbing", "uni"] }),
  note: createElement(NoteEditor, { person }),
  draft: createElement(DraftEditor, { personId: person.id, draft: { id: 4, personId: person.id, text: "Coffee soon?", createdAt: 0, updatedAt: 0 }, label: "Draft" }),
  reachOut: createElement(ReachOutSwitch, { person }),
  archive: createElement(ArchiveButton, { person }),
  join: createElement(JoinPerson, { person, onJoined: () => {} }),
  accounts: createElement(AccountList, { person }),
  location: createElement(PlaceEditor, { person, values: [] }),
  noLocation: createElement(PlaceEditor, { person: { ...person, location: null }, values: [] }),
};

const draw = (part: ReactElement, readOnly: boolean) => renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, part));
/** Anything that takes input: an enabled input, textarea or button. */
const controls = (html: string) => (html.match(/<(input|textarea|button)\b(?![^>]*disabled)/g) ?? []).length;

describe("the person panel on a read-only page", () => {
  it("shows every part with nothing to change it, where the app's page has a box, button or switch", () => {
    for (const [name, part] of Object.entries(parts)) {
      expect([name, controls(draw(part, true))]).toEqual([name, 0]);
      expect([name, controls(draw(part, false)) > 0]).toEqual([name, true]);
    }
  });

  it("still shows the name, aliases, tags, note, draft, reaching out, accounts and location, and says what is not said", () => {
    expect(draw(parts.names, true)).toContain('<span role="listitem" class="name-chip name-chip--first">Ada Sample</span><span role="listitem" class="name-chip">Addy</span>');
    expect(draw(parts.tags, true)).toContain('<span class="tag-chip">climbing</span>');
    // The rules' archive shows as the one word archive.
    expect(draw(parts.tags, true)).toContain('<span class="tag-chip tag-chip--archive">archive</span>');
    expect(draw(parts.tags, true)).not.toContain("system-archive");
    expect(draw(parts.note, true)).toContain('<p class="read-only-text">Lends good books</p>');
    expect(draw(parts.draft, true)).toContain('<p class="read-only-text">Coffee soon?</p>');
    expect(draw(parts.reachOut, true)).toMatch(/<input type="checkbox" role="switch" disabled="" checked=""/);
    expect(draw(parts.archive, true)).toBe("");
    expect(draw(parts.join, true)).toBe("");
    expect(draw(parts.accounts, true)).not.toContain("Not them");
    expect(draw(parts.accounts, false)).toContain('aria-label="Not them: make this account a separate person"');
    expect(draw(parts.location, true)).toContain("<span>Hobart</span>");
    expect(draw(parts.noLocation, true)).toContain("Not said");
  });
});
