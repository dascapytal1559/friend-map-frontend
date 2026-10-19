// `river`: the Time river's messages by app, for everyone on the map, counted as the map counts them (one-to-one both
// ways, calls aside, and theirs in group chats). It also reads GET /catch-ups (panel.ts) and GET /calls (table.ts).

import type { MessageApps } from "../../src/archive.ts";
import type { Route } from "./http.ts";
import { onTheMap } from "./people.ts";

export const RIVER: Route[] = [
  {
    capability: "river", method: "GET", path: "/message-apps",
    answer: (db) => db.memo("message apps", () => {
      const byPerson = new Map<number, MessageApps>(onTheMap(db).map((person) => [person.id, { id: person.id, apps: [] }]));
      for (const row of db.all<{ id: number; platform: string; month: string; messages: number }>(`
        SELECT id, platform, month, SUM(n) AS messages FROM (
          SELECT direct_with.person_id AS id, message_facts.platform, message_facts.month, COUNT(*) AS n
          FROM message_facts JOIN direct_with ON direct_with.chat_id = message_facts.chat_id
          WHERE message_facts.call_seconds IS NULL GROUP BY 1, 2, 3
          UNION ALL
          SELECT sender_person_id, platform, month, COUNT(*)
          FROM message_facts WHERE chat_type = 'group' AND from_you = 0 GROUP BY 1, 2, 3
        ) GROUP BY id, platform, month ORDER BY id, platform, month`)) {
        const apps = byPerson.get(row.id)?.apps;
        if (!apps) continue;
        if (apps.at(-1)?.platform !== row.platform) apps.push({ platform: row.platform, months: [] });
        apps.at(-1)!.months.push({ month: row.month, messages: row.messages });
      }
      return [...byPerson.values()].filter((person) => person.apps.length > 0);
    }),
  },
];
