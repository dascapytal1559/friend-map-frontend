// `panel`: the person panel's group chats, calls and hangouts. A call here is a call record in a one-to-one chat (a
// message with call_seconds); this backend keeps no calls logged by hand, so it has no logged call to answer.

import { NAMED_BY } from "../../src/groupName.ts";
import type { CatchUp, GroupChat, GroupPerson, PersonCall, PersonGroup } from "../../src/archive.ts";
import type { SQLInputValue } from "node:sqlite";
import type { Db } from "./db.ts";
import { found, idOf, notFound, type Route } from "./http.ts";
import { everyone, groupPeople, personById } from "./people.ts";

export const PANEL: Route[] = [
  { capability: "panel", method: "GET", path: "/people/:id/groups", answer: (db, asked) => groupsOf(db, idOf(asked)) },
  { capability: "panel", method: "GET", path: "/groups/:id", answer: (db, asked) => found(groupChat(db, idOf(asked)), "such group chat") },
  {
    capability: "panel", method: "GET", path: "/people/:id/calls",
    answer: (db, { params, query }) => {
      found(personById(db, Number(params.id)), "such person");
      const account = query.get("account");
      return callRecords(db)
        .filter((call) => call.personId === Number(params.id) && (account === null || call.accountId === Number(account)))
        .map(personCall);
    },
  },
  {
    capability: "panel", method: "GET", path: "/catch-ups",
    answer: (db, { query }) => query.get("person") === null ? catchUps(db, "")
      : catchUps(db, "WHERE catch_ups.id IN (SELECT catch_up_id FROM catch_up_people WHERE person_id = ?)", Number(query.get("person"))),
  },
  // Only calls logged by hand have one, and this backend keeps none.
  { capability: "panel", method: "GET", path: "/calls/:id", answer: () => { throw notFound("such logged call"); } },
];

/** A call record: a call in a one-to-one chat, with whom and on which of their accounts. */
export interface CallRecord {
  id: number;
  platform: string;
  at: number;
  day: string;
  seconds: number;
  fromYou: boolean;
  personId: number;
  accountId: number;
}

/** Every call record, the newest first. */
export function callRecords(db: Db): CallRecord[] {
  return db.memo("call records", () => db.all<{ id: number; platform: string; at: number; day: string; seconds: number; from_you: number; person_id: number; account_id: number }>(`
    SELECT message_facts.id, message_facts.platform, message_facts.sent_at AS at, message_facts.day, message_facts.call_seconds AS seconds,
           message_facts.from_you, them.person_id, them.id AS account_id
    FROM message_facts
    JOIN chat_members ON chat_members.chat_id = message_facts.chat_id
    JOIN accounts AS them ON them.id = chat_members.account_id
    JOIN people ON people.id = them.person_id AND people.is_you = 0
    WHERE message_facts.chat_type = 'direct' AND message_facts.call_seconds IS NOT NULL
    ORDER BY message_facts.sent_at DESC, message_facts.id DESC`)
    .map((row) => ({ id: row.id, platform: row.platform, at: row.at, day: row.day, seconds: row.seconds, fromYou: row.from_you === 1, personId: row.person_id, accountId: row.account_id })));
}

/** A call record as the person panel lists it. */
export function personCall(call: CallRecord): PersonCall {
  return {
    id: call.id, platform: call.platform, messageId: call.id, manual: false, accountId: call.accountId, at: call.at,
    durationSeconds: call.seconds, direction: call.fromYou ? "outgoing" : "incoming", answered: call.seconds > 0, service: null,
    group: null, people: 1, others: 0, note: "",
  };
}

/** Each group chat's messages added up: how many, how many yours, the first and last, and each person's. */
function groupFacts(db: Db) {
  return db.memo("group facts", () => {
    const facts = new Map<number, { messageCount: number; fromMe: number; firstMessageAt: number | null; lastMessageAt: number | null; sent: Map<number, number> }>();
    for (const row of db.all<{ chat_id: number; n: number; from_me: number; first: number; last: number }>(`
      SELECT chat_id, COUNT(*) AS n, SUM(from_you) AS from_me, MIN(sent_at) AS first, MAX(sent_at) AS last
      FROM message_facts WHERE chat_type = 'group' GROUP BY chat_id`)) {
      facts.set(row.chat_id, { messageCount: row.n, fromMe: row.from_me, firstMessageAt: row.first, lastMessageAt: row.last, sent: new Map() });
    }
    for (const row of db.all<{ chat_id: number; person_id: number; n: number }>(`
      SELECT chat_id, sender_person_id AS person_id, COUNT(*) AS n
      FROM message_facts WHERE chat_type = 'group' AND from_you = 0 GROUP BY chat_id, sender_person_id`)) {
      facts.get(row.chat_id)!.sent.set(row.person_id, row.n);
    }
    return facts;
  });
}

const noMessages = () => ({ messageCount: 0, fromMe: 0, firstMessageAt: null, lastMessageAt: null, sent: new Map<number, number>() });

/** A chat's people, you aside, with what each sent there: the most first, then A to Z. */
export function chatMembers(db: Db, chatId: number): Array<GroupPerson & { messages: number }> {
  const sent = groupFacts(db).get(chatId)?.sent ?? new Map<number, number>();
  const named = groupPeople(db);
  return db.all<{ person_id: number }>(
    "SELECT chat_people.person_id FROM chat_people JOIN people ON people.id = chat_people.person_id AND people.is_you = 0 WHERE chat_people.chat_id = ?", chatId,
  )
    .map(({ person_id }) => ({ ...named.get(person_id)!, messages: sent.get(person_id) ?? 0 }))
    .sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name) || a.id - b.id);
}

/** How many people a chat has, you included. */
export function chatSize(db: Db, chatId: number): number {
  return db.one<{ n: number }>("SELECT COUNT(*) AS n FROM chat_people WHERE chat_id = ?", chatId)!.n;
}

/** Who an untitled group chat is named by: its first few people, most messages first. */
export function namedBy(db: Db, chat: { id: number; title: string | null }): GroupPerson[] {
  return chat.title === null ? chatMembers(db, chat.id).slice(0, NAMED_BY).map(({ id, name, aliases }) => ({ id, name, aliases })) : [];
}

function groupsOf(db: Db, personId: number): PersonGroup[] {
  found(personById(db, personId), "such person");
  const facts = groupFacts(db);
  return db.all<{ id: number; title: string | null; platform: string }>(`
    SELECT chats.id, chats.title, chats.platform FROM chats
    JOIN chat_people ON chat_people.chat_id = chats.id AND chat_people.person_id = ?
    WHERE chats.type = 'group'`, personId)
    .map((chat): PersonGroup => {
      const { fromMe, lastMessageAt, sent } = facts.get(chat.id) ?? noMessages();
      return {
        id: chat.id, title: chat.title, platform: chat.platform, people: chatSize(db, chat.id), fromThem: sent.get(personId) ?? 0, fromMe, lastMessageAt,
        namedBy: namedBy(db, chat), unlinked: false,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? -Infinity) - (a.lastMessageAt ?? -Infinity) || a.id - b.id);
}

function groupChat(db: Db, id: number): GroupChat | undefined {
  const chat = db.one<{ id: number; title: string | null; platform: string }>("SELECT id, title, platform FROM chats WHERE id = ? AND type = 'group'", id);
  if (!chat) return undefined;
  const { messageCount, fromMe, firstMessageAt, lastMessageAt } = groupFacts(db).get(id) ?? noMessages();
  const people = new Map(everyone(db).map((person) => [person.id, person]));
  return {
    ...chat, people: chatSize(db, id), messageCount, fromMe, firstMessageAt, lastMessageAt,
    members: chatMembers(db, id).map((member) => ({ ...member, untouched: people.get(member.id)!.untouched, archived: people.get(member.id)!.archived !== null })),
  };
}

/** Hangouts (`where` picks them), the latest first, each with everyone at it A to Z. */
export function catchUps(db: Db, where: string, ...values: SQLInputValue[]): CatchUp[] {
  const named = groupPeople(db);
  return db.all<{ id: number; day: string; time: string | null; hours: number; by_call: number; note: string; others: number; people: string }>(`
    SELECT catch_ups.*, json_group_array(catch_up_people.person_id) AS people
    FROM catch_ups LEFT JOIN catch_up_people ON catch_up_people.catch_up_id = catch_ups.id
    ${where}
    GROUP BY catch_ups.id ORDER BY catch_ups.day DESC, catch_ups.time DESC, catch_ups.id DESC`, ...values)
    .map((row) => ({
      id: row.id, day: row.day, time: row.time, trip: null, hours: row.hours, byCall: row.by_call === 1, note: row.note, others: row.others,
      people: (JSON.parse(row.people) as Array<number | null>)
        .filter((id) => id !== null)
        .map((id) => named.get(id)!)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    }));
}
