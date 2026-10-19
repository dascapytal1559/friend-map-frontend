// `table`: the Table's rows (everyone, archived people too; friend-map adds the closeness column), its Calls tab, and
// the places and tags its filters offer. Its Hangouts tab reads GET /catch-ups (panel.ts).

import { countsByPlatform, platformsOf, tagsWithRule, BUILT_IN_TAGS, type ListedCall, type LocationInfo, type TableRow, type TagInfo } from "../../src/archive.ts";
import type { Db } from "./db.ts";
import type { Route } from "./http.ts";
import { callRecords } from "./panel.ts";
import { everyone } from "./people.ts";
import { localMoment } from "./time.ts";

export const TABLE: Route[] = [
  { capability: "table", method: "GET", path: "/table-rows", answer: (db) => db.memo("table rows", () => tableRows(db)) },
  {
    capability: "table", method: "GET", path: "/calls",
    answer: (db) => callRecords(db).map((call): ListedCall => ({
      ref: { kind: "record", id: call.id }, at: call.at, platform: call.platform, service: null, source: "record",
      direction: call.fromYou ? "outgoing" : "incoming", answered: call.seconds > 0, answeredSet: false, sourceAnswered: call.seconds > 0,
      durationSeconds: call.seconds, length: "source", lengthEditable: false, people: [call.personId], others: 0, note: "",
    })),
  },
  { capability: "table", method: "GET", path: "/locations", answer: (db) => locations(db) },
  { capability: "table", method: "GET", path: "/tags", answer: (db) => tags(db) },
];

function tableRows(db: Db): TableRow[] {
  const added = new Map(db.all<{ id: number; added_at: number }>("SELECT id, added_at FROM people").map((p) => [p.id, p.added_at]));
  const firstContact = firstContacts(db);
  return everyone(db).map((person) => ({
    id: person.id, name: person.name, location: person.location, aliases: person.aliases, tags: tagsWithRule(person), note: person.note,
    identiconSeed: person.identiconSeed, identiconHue: person.identiconHue, unknown: person.unknown, untouched: person.untouched,
    archived: person.archived, platforms: platformsOf(person.accounts),
    messageCount: person.messageCount, directMessageCount: person.directMessageCount, groupMessageCount: person.groupMessageCount,
    lastMessageAt: person.lastMessageAt, byPlatform: countsByPlatform(person.accounts),
    // The phone's own call history; this backend has none, only call records in chats.
    calls: null,
    addedAt: added.get(person.id)!,
    firstContactAt: firstContact.get(person.id) ?? null,
  }));
}

/** When you and each person were first in touch: their first one-to-one message or call, group message, or hangout. */
function firstContacts(db: Db): Map<number, number> {
  const first = new Map<number, number>();
  const earliest = (id: number, at: number) => first.set(id, Math.min(at, first.get(id) ?? at));
  for (const { id, at } of db.all<{ id: number; at: number }>(`
    SELECT direct_with.person_id AS id, MIN(messages.sent_at) AS at
    FROM messages JOIN direct_with ON direct_with.chat_id = messages.chat_id GROUP BY direct_with.person_id
    UNION ALL
    SELECT accounts.person_id AS id, MIN(messages.sent_at) AS at
    FROM messages JOIN chats ON chats.id = messages.chat_id AND chats.type = 'group' JOIN accounts ON accounts.id = messages.sender_id
    GROUP BY accounts.person_id`)) earliest(id, at);
  const zone = db.meta("time-zone")!;
  for (const { id, day, time } of db.all<{ id: number; day: string; time: string | null }>(`
    SELECT catch_up_people.person_id AS id, catch_ups.day, catch_ups.time
    FROM catch_ups JOIN catch_up_people ON catch_up_people.catch_up_id = catch_ups.id`)) earliest(id, localMoment(day, time, zone));
  return first;
}

/** Every place someone is, the most people first. */
function locations(db: Db): LocationInfo[] {
  const counts = new Map<string, number>();
  for (const { location } of everyone(db)) if (location) counts.set(location, (counts.get(location) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Every tag, in your order, with how many people have it. */
export function tags(db: Db): TagInfo[] {
  const counts = new Map<string, number>();
  for (const person of everyone(db)) for (const tag of person.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return db.all<{ name: string }>("SELECT name FROM tags ORDER BY position").map(({ name }) => ({ name, count: counts.get(name) ?? 0, builtIn: BUILT_IN_TAGS.includes(name) }));
}
