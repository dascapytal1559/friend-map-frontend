// `map`, the one capability every backend serves: the handshake (in server.ts, as it names every capability served),
// everyone, one person, and the map's report, which every map view draws (docs/contract.md, "Build your own backend").
//
// The report counts each person's messages by month, the four ways the contract counts them: one-to-one, from you and
// from them, and in group chats, what you sent in the ones they are in and what they sent. Group chats, hangouts and
// days with calls come with it, as each adds to closeness. friend-map does the scoring.

import { platformsOf, tagsWithRule, type CallDay, type GroupMembership, type MessageCounts, type PeopleListing, type PersonRelationship, type RelationshipsReport, type ScoredCatchUp } from "../../src/archive.ts";
import type { Db } from "./db.ts";
import { found, idOf, type Route } from "./http.ts";
import { everyone, onTheMap, personById } from "./people.ts";

export const MAP: Route[] = [
  { capability: "map", method: "GET", path: "/people", answer: (db, { query }) => people(db, query.get("query"), query.get("tag")) },
  { capability: "map", method: "GET", path: "/people/:id", answer: (db, asked) => found(personById(db, idOf(asked)), "such person") },
  { capability: "map", method: "GET", path: "/relationships", answer: (db) => db.memo("relationships", () => relationships(db)) },
];

/** Everyone but you, or those whose name has `words` and who have `tag`; and you, and the tags in use. */
function people(db: Db, words: string | null, tag: string | null): PeopleListing {
  const all = everyone(db);
  const counts = new Map<string, number>();
  for (const person of all) for (const t of person.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const wanted = words?.trim().toLowerCase();
  return {
    people: all.filter((person) =>
      (!tag || person.tags.includes(tag)) && (!wanted || [person.name, ...person.aliases].some((name) => name.toLowerCase().includes(wanted)))),
    me: personById(db, db.you()) ?? null,
    tags: db.all<{ name: string }>("SELECT name FROM tags ORDER BY position").filter(({ name }) => counts.has(name)).map(({ name }) => ({ tag: name, count: counts.get(name)! })),
  };
}

type Month = MessageCounts & { month: string };

function relationships(db: Db): RelationshipsReport {
  const archivedCount = everyone(db).filter((person) => person.archived !== null).length;
  // Each person's months, and their first and last message, added up from the three counts below.
  const months = new Map<number, Map<string, Month>>();
  const dates = new Map<number, { first: number; last: number }>();
  const monthOf = (id: number, month: string) => {
    const theirs = months.get(id) ?? months.set(id, new Map()).get(id)!;
    return theirs.get(month) ?? theirs.set(month, { month, directFromMe: 0, directFromThem: 0, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 }).get(month)!;
  };
  const dated = (id: number, first: number, last: number) => {
    const seen = dates.get(id);
    dates.set(id, { first: Math.min(first, seen?.first ?? first), last: Math.max(last, seen?.last ?? last) });
  };

  // One-to-one: what you sent them, and they you (calls are not messages).
  for (const row of db.all<{ id: number; month: string; from_me: number; from_them: number; first: number; last: number }>(`
    SELECT direct_with.person_id AS id, message_facts.month, SUM(message_facts.from_you) AS from_me,
           SUM(1 - message_facts.from_you) AS from_them, MIN(message_facts.sent_at) AS first, MAX(message_facts.sent_at) AS last
    FROM message_facts JOIN direct_with ON direct_with.chat_id = message_facts.chat_id
    WHERE message_facts.call_seconds IS NULL
    GROUP BY direct_with.person_id, message_facts.month`)) {
    Object.assign(monthOf(row.id, row.month), { directFromMe: row.from_me, directFromThem: row.from_them });
    dated(row.id, row.first, row.last);
  }
  // Group chats: what they sent there.
  for (const row of db.all<{ id: number; month: string; n: number; first: number; last: number }>(`
    SELECT sender_person_id AS id, month, COUNT(*) AS n, MIN(sent_at) AS first, MAX(sent_at) AS last
    FROM message_facts WHERE chat_type = 'group' AND from_you = 0
    GROUP BY sender_person_id, month`)) {
    monthOf(row.id, row.month).groupFromThem = row.n;
    dated(row.id, row.first, row.last);
  }
  // Group chats: what you sent in the ones they are in.
  for (const row of db.all<{ id: number; month: string; n: number }>(`
    SELECT chat_people.person_id AS id, mine.month, SUM(mine.n) AS n
    FROM (SELECT chat_id, month, COUNT(*) AS n FROM message_facts WHERE chat_type = 'group' AND from_you = 1 GROUP BY chat_id, month) AS mine
    JOIN chat_people ON chat_people.chat_id = mine.chat_id
    JOIN people ON people.id = chat_people.person_id AND people.is_you = 0
    GROUP BY chat_people.person_id, mine.month`)) {
    monthOf(row.id, row.month).groupFromMe = row.n;
  }

  return {
    generatedAt: Date.now(),
    gapDays: 14,
    archivedCount,
    people: onTheMap(db).map((person): PersonRelationship => {
      const theirs = [...(months.get(person.id)?.values() ?? [])].sort((a, b) => a.month.localeCompare(b.month));
      return {
        id: person.id,
        name: person.name,
        months: theirs,
        totals: theirs.reduce((sum, m) => ({
          directFromMe: sum.directFromMe + m.directFromMe, directFromThem: sum.directFromThem + m.directFromThem, directFromMeSelfOnly: 0,
          groupFromMe: sum.groupFromMe + m.groupFromMe, groupFromThem: sum.groupFromThem + m.groupFromThem,
        }), { directFromMe: 0, directFromThem: 0, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 }),
        firstMessageAt: dates.get(person.id)?.first ?? null,
        lastMessageAt: dates.get(person.id)?.last ?? null,
        aliases: person.aliases,
        tags: tagsWithRule(person),
        note: person.note,
        shouldReachOut: person.shouldReachOut,
        identiconSeed: person.identiconSeed,
        identiconHue: person.identiconHue,
        location: person.location,
        unknown: person.unknown,
        platforms: platformsOf(person.accounts),
        // Neither is kept here: friend-map takes none.
        reactions: { fromMe: 0, fromThem: 0 },
        openings: { byMe: 0, byThem: 0 },
      };
    }),
    groups: groups(db),
    unlinks: [],
    catchUps: scoredCatchUps(db),
    callDays: callDays(db),
  };
}

/** Every group chat with someone in it, the busiest first: who is in it, and its messages by month (yours, and each person's). */
function groups(db: Db): GroupMembership[] {
  const byChat = new Map<number, GroupMembership>();
  const monthOf = new Map<string, GroupMembership["months"][number]>();
  for (const { chat_id, person_id } of db.all<{ chat_id: number; person_id: number }>(`
    SELECT chat_people.chat_id, chat_people.person_id FROM chat_people
    JOIN chats ON chats.id = chat_people.chat_id AND chats.type = 'group'
    JOIN people ON people.id = chat_people.person_id AND people.is_you = 0
    ORDER BY chat_people.person_id`)) {
    const group = byChat.get(chat_id) ?? byChat.set(chat_id, { id: chat_id, memberIds: [], selfOnly: false, messageCount: 0, lastMessageAt: null, months: [] }).get(chat_id)!;
    group.memberIds.push(person_id);
  }
  for (const row of db.all<{ chat_id: number; month: string; messages: number; from_me: number; last: number }>(`
    SELECT chat_id, month, COUNT(*) AS messages, SUM(from_you) AS from_me, MAX(sent_at) AS last
    FROM message_facts WHERE chat_type = 'group' GROUP BY chat_id, month ORDER BY chat_id, month`)) {
    const group = byChat.get(row.chat_id);
    if (!group) continue;
    const month: GroupMembership["months"][number] = { month: row.month, messages: row.messages, fromMe: row.from_me, fromMembers: [] };
    group.months.push(month);
    monthOf.set(`${row.chat_id} ${row.month}`, month);
    group.messageCount += row.messages;
    group.lastMessageAt = Math.max(group.lastMessageAt ?? 0, row.last);
  }
  for (const row of db.all<{ chat_id: number; month: string; id: number; count: number }>(`
    SELECT chat_id, month, sender_person_id AS id, COUNT(*) AS count
    FROM message_facts WHERE chat_type = 'group' AND from_you = 0
    GROUP BY chat_id, month, sender_person_id ORDER BY sender_person_id`)) {
    monthOf.get(`${row.chat_id} ${row.month}`)?.fromMembers.push({ id: row.id, count: row.count });
  }
  return [...byChat.values()].sort((a, b) => b.messageCount - a.messageCount || a.id - b.id);
}

/** Every hangout, oldest first, with who was there. */
export function scoredCatchUps(db: Db): ScoredCatchUp[] {
  return db.all<{ id: number; day: string; time: string | null; hours: number; others: number; people: string }>(`
    SELECT catch_ups.*, json_group_array(catch_up_people.person_id) AS people
    FROM catch_ups LEFT JOIN catch_up_people ON catch_up_people.catch_up_id = catch_ups.id
    GROUP BY catch_ups.id ORDER BY catch_ups.day, catch_ups.time, catch_ups.id`)
    .map((row) => ({
      id: row.id, day: row.day, time: row.time, trip: null, hours: row.hours, others: row.others,
      personIds: (JSON.parse(row.people) as Array<number | null>).filter((id) => id !== null).sort((a, b) => a - b),
    }));
}

/** How long your answered one-to-one calls with each person were connected, by day. */
function callDays(db: Db): CallDay[] {
  return db.all<CallDay>(`
    SELECT direct_with.person_id AS personId, message_facts.day, SUM(message_facts.call_seconds) AS seconds
    FROM message_facts JOIN direct_with ON direct_with.chat_id = message_facts.chat_id
    WHERE message_facts.call_seconds > 0
    GROUP BY direct_with.person_id, message_facts.day`).map((row) => ({ ...row }));
}
