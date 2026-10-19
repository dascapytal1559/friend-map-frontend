// People as the contract's answers say them (PersonSummary in src/archive.ts): each person's own row, their tags, and
// their accounts with the messages counted. Every route that answers someone builds them here.

import { ARCHIVE_TAG, KEEP_TAG, type AccountSummary, type ArchiveReason, type ArchiveRule, type GroupPerson, type PersonSummary } from "../../src/archive.ts";
import type { Db } from "./db.ts";

/** A row of the people table. */
export interface PersonRow {
  id: number;
  name: string;
  aliases: string;
  note: string;
  location: string | null;
  should_reach_out: number;
  identicon_seed: string;
  identicon_hue: number | null;
  is_you: number;
  archive_rule: ArchiveRule | null;
  edited: number;
  added_at: number;
}

/**
 * Whether someone is off the map, and why: by you (the "archive" tag), or by the backend's rule, unless they are you,
 * tagged "keep" or changed by you.
 */
export function archivedOf(person: PersonRow, tags: readonly string[]): ArchiveReason | null {
  if (person.is_you) return null;
  if (tags.includes(ARCHIVE_TAG)) return "you";
  if (tags.includes(KEEP_TAG) || person.edited) return null;
  return person.archive_rule;
}

/** Everyone's tags, in your tag order. */
export function tagsByPerson(db: Db): Map<number, string[]> {
  return db.memo("tags by person", () => {
    const tags = new Map<number, string[]>();
    const rows = db.all<{ person_id: number; tag: string }>(
      "SELECT person_tags.person_id, person_tags.tag FROM person_tags JOIN tags ON tags.name = person_tags.tag ORDER BY tags.position",
    );
    for (const { person_id, tag } of rows) tags.set(person_id, [...(tags.get(person_id) ?? []), tag]);
    return tags;
  });
}

/**
 * Everyone's accounts, with their messages counted: in one-to-one chats, both ways (calls aside), and what the account
 * sent in group chats. The latest of either is its last message.
 */
export function accountsByPerson(db: Db): Map<number, AccountSummary[]> {
  return db.memo("accounts by person", () => {
    const rows = db.all<{ id: number; person_id: number; platform: string; display_name: string; handle: string | null; direct: number; in_groups: number; last: number | null }>(`
      WITH direct AS (
        SELECT chat_members.account_id, COUNT(*) AS n, MAX(messages.sent_at) AS last
        FROM chat_members
        JOIN chats ON chats.id = chat_members.chat_id AND chats.type = 'direct'
        JOIN messages ON messages.chat_id = chats.id AND messages.call_seconds IS NULL
        GROUP BY chat_members.account_id
      ), in_groups AS (
        SELECT messages.sender_id AS account_id, COUNT(*) AS n, MAX(messages.sent_at) AS last
        FROM messages JOIN chats ON chats.id = messages.chat_id AND chats.type = 'group'
        GROUP BY messages.sender_id
      )
      SELECT accounts.id, accounts.person_id, accounts.platform, accounts.display_name, accounts.handle,
             COALESCE(direct.n, 0) AS direct, COALESCE(in_groups.n, 0) AS in_groups,
             NULLIF(MAX(COALESCE(direct.last, 0), COALESCE(in_groups.last, 0)), 0) AS last
      FROM accounts
      LEFT JOIN direct ON direct.account_id = accounts.id
      LEFT JOIN in_groups ON in_groups.account_id = accounts.id
      ORDER BY last DESC`);
    const accounts = new Map<number, AccountSummary[]>();
    for (const row of rows) {
      const account: AccountSummary = {
        id: row.id, platform: row.platform, displayName: row.display_name, handle: row.handle, link: "import",
        messageCount: row.direct + row.in_groups, directMessageCount: row.direct, groupMessageCount: row.in_groups, lastMessageAt: row.last,
      };
      accounts.set(row.person_id, [...(accounts.get(row.person_id) ?? []), account]);
    }
    return accounts;
  });
}

/** One person row as a PersonSummary, with their tags and accounts. */
export function summaryOf(db: Db, person: PersonRow): PersonSummary {
  const tags = tagsByPerson(db).get(person.id) ?? [];
  const accounts = accountsByPerson(db).get(person.id) ?? [];
  const sum = (pick: (account: AccountSummary) => number) => accounts.reduce((n, account) => n + pick(account), 0);
  const lastByPlatform = new Map<string, number>();
  for (const { platform, lastMessageAt } of accounts) {
    if (lastMessageAt !== null && lastMessageAt > (lastByPlatform.get(platform) ?? -Infinity)) lastByPlatform.set(platform, lastMessageAt);
  }
  const lasts = [...lastByPlatform.values()];
  return {
    id: person.id,
    name: person.name,
    aliases: JSON.parse(person.aliases) as string[],
    tags,
    note: person.note,
    noteFromContacts: false,
    shouldReachOut: person.should_reach_out === 1,
    identiconSeed: person.identicon_seed,
    identiconHue: person.identicon_hue,
    location: person.location,
    edited: person.edited === 1,
    untouched: person.is_you === 0 && person.edited === 0,
    archived: archivedOf(person, tags),
    archiveRule: person.archive_rule,
    accounts,
    messageCount: sum((a) => a.messageCount),
    directMessageCount: sum((a) => a.directMessageCount),
    groupMessageCount: sum((a) => a.groupMessageCount),
    marketplaceMessageCount: 0,
    lastMessageAt: lasts.length > 0 ? Math.max(...lasts) : null,
    unknown: false,
    lastByPlatform: [...lastByPlatform].map(([platform, at]) => ({ platform, at })).sort((a, b) => b.at - a.at),
    joined: null,
  };
}

/** Everyone but you, as PersonSummaries, the latest message first (then A to Z). */
export function everyone(db: Db): PersonSummary[] {
  return db.memo("everyone", () =>
    db.all<PersonRow>("SELECT * FROM people WHERE is_you = 0")
      .map((row) => summaryOf(db, row))
      .sort((a, b) => (b.lastMessageAt ?? -1) - (a.lastMessageAt ?? -1) || a.name.localeCompare(b.name)));
}

/** One person (you too) as a PersonSummary, or undefined for an id nobody has. */
export function personById(db: Db, id: number): PersonSummary | undefined {
  const row = db.one<PersonRow>("SELECT * FROM people WHERE id = ?", id);
  return row && summaryOf(db, row);
}

/** Everyone on the map: everyone but you whom nothing archives. */
export function onTheMap(db: Db): PersonSummary[] {
  return everyone(db).filter((person) => person.archived === null);
}

/** People by id, as a group chat or a hangout names them (GroupPerson). */
export function groupPeople(db: Db): Map<number, GroupPerson> {
  return db.memo("group people", () => new Map(
    db.all<{ id: number; name: string; aliases: string }>("SELECT id, name, aliases FROM people")
      .map(({ id, name, aliases }) => [id, { id, name, aliases: JSON.parse(aliases) as string[] }]),
  ));
}
