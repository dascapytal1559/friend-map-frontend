// Beside each account in a person's panel: an icon that opens that account's
// own messages, to see who it really is, and changes nothing; and "Not them",
// an ×, with its words as its label and tooltip, which takes that one account
// off them, as the words did.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonSummary } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { AccountList, DetachButton, OpenAccountButton } from "./PersonParts.tsx";
import { ReadOnly } from "./readOnly.ts";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const account = (id: number, platform: string) => ({
  id, platform, displayName: "Ada Sample", handle: null, link: "import" as const, messageCount: 1, directMessageCount: 1, groupMessageCount: 0, lastMessageAt: NOW,
});
const person: PersonSummary = {
  id: 1, name: "Ada Sample", aliases: [], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null,
  edited: false, untouched: false, archived: null, archiveRule: null, location: null,
  accounts: [account(10, "messenger"), account(11, "whatsapp")],
  messageCount: 2, directMessageCount: 2, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: NOW, unknown: false,
  lastByPlatform: [], joined: null,
};

afterEach(() => vi.unstubAllGlobals());

const OPEN = 'aria-label="Open this account&#x27;s messages"';
const openButtons = (html: string) => html.match(/<button[^>]*account-list__open[^>]*>/g) ?? [];

describe("open an account's messages", () => {
  it("shows an open icon on every account, labelled and titled, and pressed on the one open", () => {
    const html = renderToStaticMarkup(createElement(AccountList, { person, onOpen: () => {}, openAccount: 11 }));
    const buttons = openButtons(html);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toContain(OPEN);
      expect(button).toContain('title="Open this account&#x27;s messages, to see who it really is"');
    }
    expect(buttons.map((b) => b.includes('aria-pressed="true"'))).toEqual([false, true]);
  });

  it("shows it for a person with one account, and on a read-only page, since it changes nothing", () => {
    const one = { ...person, accounts: [account(10, "messenger")] };
    expect(openButtons(renderToStaticMarkup(createElement(AccountList, { person: one, onOpen: () => {} })))).toHaveLength(1);
    const readOnly = renderToStaticMarkup(createElement(ReadOnly.Provider, { value: true }, createElement(AccountList, { person, onOpen: () => {} })));
    expect(openButtons(readOnly)).toHaveLength(2);
    expect(readOnly).not.toContain("Not them");
  });

  it("is not there where nothing can open an account", () => {
    expect(renderToStaticMarkup(createElement(AccountList, { person }))).not.toContain(OPEN);
  });

  it("opens that account", () => {
    const onOpen = vi.fn();
    const button = OpenAccountButton({ accountId: 11, open: false, onOpen }) as ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    expect(onOpen).toHaveBeenCalledWith(11);
  });
});

describe("Not them, as an ×", () => {
  it("shows an × on each account, labelled and titled with what it does", () => {
    const html = renderToStaticMarkup(createElement(AccountList, { person }));
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toContain('aria-label="Not them: make this account a separate person"');
      expect(button).toContain('title="Not them: make this account a separate person"');
      expect(button).toMatch(/>×<\/button>$/);
    }
    expect(html).not.toContain(">Not them<");
  });

  it("offers none for a person with one account", () => {
    const html = renderToStaticMarkup(createElement(AccountList, { person: { ...person, accounts: [account(10, "messenger")] } }));
    expect(html).not.toContain("<button");
  });

  it("detaches that account from that person, then tells the views to reload", async () => {
    const events = new EventTarget();
    vi.stubGlobal("document", events);
    const reloaded = vi.fn();
    events.addEventListener("friend-map:archive-changed", reloaded);
    const detach = vi.fn(async () => person);
    provideArchive({ detach } as unknown as ArchiveApi);
    const button = DetachButton({ personId: 1, accountId: 11 }) as ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    await vi.waitFor(() => expect(reloaded).toHaveBeenCalled());
    expect(detach).toHaveBeenCalledWith(1, 11);
  });
});

describe("two lines an account", () => {
  it("puts the platform on its own, the name over the stats as whole parts, and the buttons apart", () => {
    const html = renderToStaticMarkup(createElement(AccountList, { person, onOpen: () => {} }));
    const row = html.match(/<li[^>]*>(.*?)<\/li>/)![1];
    expect(row).toMatch(/^<span class="platform-badge">Messenger<\/span><span class="account-list__text"><span class="account-list__name" title="Ada Sample">Ada Sample<\/span>/);
    expect(row).toMatch(/<span class="muted account-list__count"[^>]*><span>1 msg<\/span> · <span>[^<]+<\/span><\/span><\/span><span class="account-list__actions"><button/);
  });
});

describe("a call account", () => {
  const call = (id: number, at: string, durationSeconds: number, answered = true, accountId = 12) =>
    ({ id, platform: "phone", messageId: null, manual: false, accountId, at: Date.parse(at), durationSeconds, direction: "incoming" as const, answered, service: "phone" as const, group: null, people: 1, others: 0, note: "" });
  const called = { ...person, accounts: [account(10, "messenger"), { ...account(12, "phone"), messageCount: 0, directMessageCount: 0, lastMessageAt: null }] };
  const html = (calls: ReturnType<typeof call>[]) => renderToStaticMarkup(createElement(AccountList, { person: called, calls }));
  // What the call account's row reads, without its markup.
  const text = (calls: ReturnType<typeof call>[]) => html(calls).match(/Answered calls[^>]*>(.*?)<\/span><\/span><span class="account-list__actions"/)![1].replace(/<[^>]+>/g, "");

  it("is badged Phone call and shows its answered calls, their time in all and the last call, not messages", () => {
    // Newest first, as the server gives them; another account's call is left out.
    const shown = html([call(4, "2026-08-21T10:00:00+10:00", 0, false), call(3, "2026-08-20T10:00:00+10:00", 3000), call(2, "2026-08-01T10:00:00+10:00", 1980), call(1, "2026-07-01T10:00:00+10:00", 0, true, 99)]);
    expect(shown).toContain('<span class="platform-badge">Phone call</span>');
    expect(text([call(4, "2026-08-21T10:00:00+10:00", 0, false), call(3, "2026-08-20T10:00:00+10:00", 3000), call(2, "2026-08-01T10:00:00+10:00", 1980)])).toBe("2 calls · 1 h 23 min · 2026-08-21");
    expect(shown).toContain("(1 not answered)");
    expect(shown.match(/msg/g)).toHaveLength(1);
  });

  it("with no answered calls says how many were missed, with no time", () => {
    expect(text([call(1, "2026-08-21T10:00:00+10:00", 0, false)])).toBe("1 missed call · 2026-08-21");
    expect(text([call(2, "2026-08-21T10:00:00+10:00", 0, false), call(1, "2026-08-20T10:00:00+10:00", 0, false)])).toBe("2 missed · 2026-08-21");
    expect(text([])).toBe("No calls");
  });
});
