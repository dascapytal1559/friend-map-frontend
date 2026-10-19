// `calendar`: a month at a glance (each day's messages by chat, its calls and hangouts, with who was in each, so the page
// can hide people by tag), one day in full, and a chat's messages on one day (dayMessages in content.ts). Message text
// comes only from the last, under /content.

import { tagsWithRule, type CalendarChat, type CalendarDay, type CalendarDayChat, type CalendarDayCounts, type CalendarMonth, type PersonSummary } from "../../src/archive.ts";
import { dayMessages } from "./content.ts";
import type { Db } from "./db.ts";
import type { Route } from "./http.ts";
import { callRecords, catchUps, chatSize, namedBy, personCall } from "./panel.ts";
import { everyone, personById } from "./people.ts";

export const CALENDAR: Route[] = [
  { capability: "calendar", method: "GET", path: "/calendar/:month", answer: (db, { params }) => month(db, params.month) },
  { capability: "calendar", method: "GET", path: "/calendar/:day", answer: (db, { params }) => day(db, params.day) },
  { capability: "calendar", method: "GET", path: "/content/conversations/:id/days/:day", answer: dayMessages },
];

/** Each chat's people, you aside: a one-to-one chat's other person, a group chat's members. */
function chatPeople(db: Db): Map<number, CalendarChat> {
  return db.memo("calendar chats", () => {
    const chats = new Map<number, CalendarChat>();
    for (const { chat_id, type, person_id } of db.all<{ chat_id: number; type: "direct" | "group"; person_id: number | null }>(`
      SELECT chats.id AS chat_id, chats.type, people.id AS person_id FROM chats
      LEFT JOIN chat_people ON chat_people.chat_id = chats.id
      LEFT JOIN people ON people.id = chat_people.person_id AND people.is_you = 0`)) {
      const chat = chats.get(chat_id) ?? chats.set(chat_id, { id: chat_id, type, people: [] }).get(chat_id)!;
      if (person_id !== null) chat.people.push(person_id);
    }
    return chats;
  });
}

/** Someone by id: you, or anyone else. */
function people(db: Db): Map<number, PersonSummary> {
  return db.memo("people by id", () => new Map([personById(db, db.you())!, ...everyone(db)].map((person) => [person.id, person])));
}

function month(db: Db, month: string): CalendarMonth {
  const span = db.one<{ first: string | null; last: string | null }>("SELECT MIN(day) AS first, MAX(day) AS last FROM (SELECT day FROM messages UNION ALL SELECT day FROM catch_ups)")!;
  const days = new Map<string, CalendarDayCounts>();
  const dayOf = (day: string) => days.get(day) ?? days.set(day, { day, chats: [], calls: [], catchUps: [] }).get(day)!;
  const chats = new Set<number>();
  for (const { chat_id, day, n } of db.all<{ chat_id: number; day: string; n: number }>(`
    SELECT chat_id, day, COUNT(*) AS n FROM messages
    WHERE day BETWEEN ? AND ? AND call_seconds IS NULL
    GROUP BY chat_id, day ORDER BY day, chat_id`, `${month}-01`, `${month}-31`)) {
    dayOf(day).chats.push({ chat: chat_id, messages: n });
    chats.add(chat_id);
  }
  for (const call of callRecords(db).filter((c) => c.day.startsWith(month)).reverse()) {
    dayOf(call.day).calls.push({ person: call.personId, answered: call.seconds > 0, seconds: call.seconds, group: null });
  }
  for (const catchUp of catchUps(db, "WHERE catch_ups.day BETWEEN ? AND ?", `${month}-01`, `${month}-31`).reverse()) {
    dayOf(catchUp.day).catchUps.push({ id: catchUp.id, people: catchUp.people.map((p) => p.id), hours: catchUp.hours });
  }
  const inChats = [...chats].map((id) => chatPeople(db).get(id)!);
  const ids = new Set([...inChats.flatMap((c) => c.people), ...[...days.values()].flatMap((d) => [...d.calls.map((c) => c.person), ...d.catchUps.flatMap((c) => c.people)])]);
  const everyoneById = people(db);
  return {
    month,
    span,
    chats: inChats,
    people: [...ids].map((id) => ({ id, tags: tagsWithRule(everyoneById.get(id)!) })),
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

function day(db: Db, day: string): CalendarDay {
  const chats = db.all<{ id: number; platform: string; title: string | null; messages: number; first: number; last: number }>(`
    SELECT chats.id, chats.platform, chats.title, COUNT(*) AS messages, MIN(messages.sent_at) AS first, MAX(messages.sent_at) AS last
    FROM messages JOIN chats ON chats.id = messages.chat_id
    WHERE messages.day = ? AND messages.call_seconds IS NULL
    GROUP BY chats.id ORDER BY first`, day)
    .map((chat): CalendarDayChat => ({ ...chatPeople(db).get(chat.id)!, ...chat, size: chatSize(db, chat.id), namedBy: namedBy(db, chat) }));
  const calls = callRecords(db).filter((call) => call.day === day).reverse().map((call) => ({ ...personCall(call), person: call.personId }));
  const dayCatchUps = catchUps(db, "WHERE catch_ups.day = ?", day).reverse();
  const ids = new Set([...chats.flatMap((c) => c.people), ...calls.map((c) => c.person), ...dayCatchUps.flatMap((c) => c.people.map((p) => p.id))]);
  const everyoneById = people(db);
  return {
    day,
    catchUps: dayCatchUps,
    calls,
    chats,
    people: [...ids].map((id) => {
      const person = everyoneById.get(id)!;
      return { id, name: person.name, aliases: person.aliases, tags: tagsWithRule(person), identiconSeed: person.identiconSeed, identiconHue: person.identiconHue };
    }),
  };
}
