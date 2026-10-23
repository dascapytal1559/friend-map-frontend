// `content`: the person panel's messages, a page at a time, newest first. Pages are found by a cursor, "sentAt:id" of
// the message a page ended on, so a page never shifts when new messages come in. This backend keeps no attachment
// files, so it has none to answer.

import type { SQLInputValue } from "node:sqlite";
import type { DayMessagesPage, TimelineMessage, TimelinePage } from "../../src/archive.ts";
import type { Db } from "./db.ts";
import { badRequest, found, idOf, type Asked, type Route } from "./http.ts";
import { accountsByPerson, personById } from "./people.ts";

const PAGE = 50;
const MOST = 5000;

export const CONTENT: Route[] = [
  {
    capability: "content", method: "GET", path: "/content/people/:id/timeline",
    answer: (db, asked) => {
      const id = idOf(asked);
      found(personById(db, id), "such person");
      const account = asked.query.get("account");
      const theirs = (accountsByPerson(db).get(id) ?? []).map((a) => a.id).filter((a) => account === null || a === Number(account));
      if (account !== null && theirs.length === 0) throw badRequest("that account is not theirs");
      // Their one-to-one chats, and with groups=1, what they said in group chats.
      const source = `(messages.chat_id IN (SELECT chat_id FROM chat_members JOIN chats ON chats.id = chat_id AND chats.type = 'direct' WHERE account_id IN (SELECT value FROM json_each(?)))
        ${flag(asked, "groups") ? "OR (chats.type = 'group' AND messages.sender_id IN (SELECT value FROM json_each(?)))" : ""})`;
      return page(db, asked, source, flag(asked, "groups") ? [JSON.stringify(theirs), JSON.stringify(theirs)] : [JSON.stringify(theirs)]);
    },
  },
  {
    capability: "content", method: "GET", path: "/content/conversations/:id/messages",
    answer: (db, asked) => page(db, asked, "messages.chat_id = ?", [idOf(asked)]),
  },
];

/** `calendar`'s read of one chat's messages on one day, oldest first, from `after`. */
export function dayMessages(db: Db, asked: Asked): DayMessagesPage {
  const size = pageSize(asked);
  const after = cursor(asked.query.get("after"));
  const rows = db.all<MessageRow>(`${SELECT} WHERE messages.chat_id = ? AND messages.day = ? ${after ? "AND (messages.sent_at, messages.id) > (?, ?)" : ""}
    ORDER BY messages.sent_at, messages.id LIMIT ?`, idOf(asked), asked.params.day, ...(after ?? []), size + 1);
  const more = rows.length > size;
  const messages = rows.slice(0, size).map(timelineMessage);
  return { messages, nextAfter: more ? cursorOf(messages.at(-1)!) : null };
}

interface MessageRow {
  id: number;
  chat_id: number;
  sent_at: number;
  text: string | null;
  call_seconds: number | null;
  platform: string;
  type: "direct" | "group";
  title: string | null;
  sender: string;
  from_you: number;
}

const SELECT = `
  SELECT messages.id, messages.chat_id, messages.sent_at, messages.text, messages.call_seconds,
         chats.platform, chats.type, chats.title, accounts.display_name AS sender, people.is_you AS from_you
  FROM messages
  JOIN chats ON chats.id = messages.chat_id
  JOIN accounts ON accounts.id = messages.sender_id
  JOIN people ON people.id = accounts.person_id`;

function timelineMessage(row: MessageRow): TimelineMessage {
  const call = row.call_seconds !== null;
  return {
    id: row.id, platform: row.platform, conversation: { id: row.chat_id, type: row.type, title: row.title, marketplace: false },
    sentAt: row.sent_at, fromSelf: row.from_you === 1, sender: row.sender, type: call ? "call" : "text", text: row.text, unsent: false,
    callSeconds: row.call_seconds, callLengthGiven: false, callNote: "", callAnswer: null, attachments: [], reactions: [],
  };
}

const flag = (asked: Asked, key: string) => ["1", "true"].includes(asked.query.get(key) ?? "");
const cursorOf = (message: TimelineMessage) => `${message.sentAt}:${message.id}`;

function pageSize(asked: Asked): number {
  const limit = Number(asked.query.get("limit") ?? PAGE);
  return Number.isFinite(limit) ? Math.min(MOST, Math.max(1, Math.floor(limit))) : PAGE;
}

/** A cursor's sentAt and id; null for none; a 400 for one that is not "sentAt:id". */
function cursor(text: string | null): [number, number] | null {
  if (text === null || text === "") return null;
  const match = /^(-?\d+):(\d+)$/.exec(text);
  if (!match) throw badRequest("a cursor is sentAt:id");
  return [Number(match[1]), Number(match[2])];
}

/**
 * A page of the messages `source` (SQL, with `values`) picks, newest first: the `limit` older than `before`, or the
 * `limit` just newer than `after` with where the next newer page starts; with count=1, how many there are in all.
 */
function page(db: Db, asked: Asked, source: string, values: SQLInputValue[]): TimelinePage {
  const size = pageSize(asked);
  const after = cursor(asked.query.get("after"));
  const before = after ? null : cursor(asked.query.get("before"));
  const total = flag(asked, "count") ? { total: db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM messages JOIN chats ON chats.id = messages.chat_id WHERE ${source}`, ...values)!.n } : {};
  if (after) {
    const rows = db.all<MessageRow>(`${SELECT} WHERE ${source} AND (messages.sent_at, messages.id) > (?, ?) ORDER BY messages.sent_at, messages.id LIMIT ?`, ...values, ...after, size + 1);
    const oldestFirst = rows.slice(0, size).map(timelineMessage);
    const newest = oldestFirst.at(-1);
    return { messages: oldestFirst.reverse(), nextBefore: null, nextAfter: rows.length > size && newest ? cursorOf(newest) : null, ...total };
  }
  const rows = db.all<MessageRow>(`${SELECT} WHERE ${source} ${before ? "AND (messages.sent_at, messages.id) < (?, ?)" : ""} ORDER BY messages.sent_at DESC, messages.id DESC LIMIT ?`,
    ...values, ...(before ?? []), size + 1);
  const messages = rows.slice(0, size).map(timelineMessage);
  return { messages, nextBefore: rows.length > size ? cursorOf(messages.at(-1)!) : null, ...total };
}
