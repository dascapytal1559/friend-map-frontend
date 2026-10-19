// Fills a new database with the demo's made-up crowd (src/demo/generate.ts): the people, accounts, chats, messages and
// hangouts the public demo draws, made as of `now` and written once into the tables of schema.sql. Nobody in it is
// real. Who the backend's rules take off the map is decided here, by the demo's own rules (src/demo/archive.ts), and
// kept with each person (people.archive_rule); everything else is counted from the tables as friend-map asks.
//
// The demo's Marketplace chats are left out: they are an extension of the life archive's, which no backend needs.

import { DemoArchive } from "../../src/demo/archive.ts";
import { generateDemo, messageText, type DemoOptions } from "../../src/demo/generate.ts";
import { DEMO_TIME_ZONE } from "../../src/demo/timeZone.ts";
import { identiconSeedOf } from "../../src/identicon.ts";
import { setTimeZone } from "../../src/time.ts";
import type { Db } from "./db.ts";
import { localDays } from "./time.ts";

/** The crowd's time zone, which the handshake names: the demo's, the one its days were made in. */
export const TIME_ZONE = DEMO_TIME_ZONE;

/** Writes the crowd as of `now` into `db`, which must be new; `crowd` sizes it (the public demo's size by default). */
export function seed(db: Db, { now = Date.now(), crowd = {} }: { now?: number; crowd?: DemoOptions } = {}): void {
  // The crowd's hangouts are made on days of its own time zone.
  setTimeZone(TIME_ZONE);
  const data = generateDemo(now, crowd);
  const rules = new DemoArchive(data);
  const dayOf = localDays(TIME_ZONE);

  db.transaction(() => {
    db.run("INSERT INTO meta (key, value) VALUES ('time-zone', ?), ('seeded-at', ?)", TIME_ZONE, String(now));
    data.tags.forEach((tag, position) => db.run("INSERT INTO tags (name, position) VALUES (?, ?)", tag, position));

    for (const person of data.people) {
      db.run(
        `INSERT INTO people (id, name, aliases, note, location, should_reach_out, identicon_seed, is_you, archive_rule, edited, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        person.id, person.name, JSON.stringify(person.aliases), person.note, person.location, person.shouldReachOut ? 1 : 0,
        identiconSeedOf(person.id, 0), person.isSelf ? 1 : 0, rules.person(person.id)?.archiveRule ?? null, person.edited ? 1 : 0, now,
      );
      for (const tag of person.tags) db.run("INSERT INTO person_tags (person_id, tag) VALUES (?, ?)", person.id, tag);
    }
    for (const account of data.accounts) {
      db.run("INSERT INTO accounts (id, person_id, platform, display_name, handle) VALUES (?, ?, ?, ?, ?)",
        account.id, account.personId, account.platform, account.displayName, account.handle);
    }

    const { conversation: chatOf, sender, sentAt, calls } = data.messages;
    for (const chat of data.conversations) {
      if (chat.marketplace) continue;
      db.run("INSERT INTO chats (id, platform, type, title) VALUES (?, ?, ?, ?)", chat.id, chat.platform, chat.type, chat.title);
      // A group chat's people are its listed members and whoever wrote there.
      const members = new Set(chat.memberAccountIds);
      if (chat.type === "group") for (let i = chat.start; i < chat.start + chat.count; i++) members.add(sender[i]);
      for (const account of members) db.run("INSERT INTO chat_members (chat_id, account_id) VALUES (?, ?)", chat.id, account);
      for (let i = chat.start; i < chat.start + chat.count; i++) {
        const call = calls.get(i);
        db.run("INSERT INTO messages (id, chat_id, sender_id, sent_at, day, text, call_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
          i + 1, chatOf[i], sender[i], sentAt[i], dayOf(sentAt[i]), call === undefined ? messageText(data, i) : null, call ?? null);
      }
    }

    for (const catchUp of data.catchUps) {
      db.run("INSERT INTO catch_ups (id, day, time, hours, by_call, note, others) VALUES (?, ?, ?, ?, ?, ?, ?)",
        catchUp.id, catchUp.day, catchUp.time, catchUp.hours, catchUp.byCall ? 1 : 0, catchUp.note, catchUp.others);
      for (const person of catchUp.personIds) db.run("INSERT INTO catch_up_people (catch_up_id, person_id) VALUES (?, ?)", catchUp.id, person);
    }
  });
}
