# The demo backend

A backend for friend-map, of made-up people: the public demo's crowd, written into a SQLite file and served over HTTP under `/api/archive`, as friend-map's data contract asks ([`docs/contract.md`](../../docs/contract.md)). Run it beside friend-map to try the app with no backend of your own, or read it as a worked example of building one.

```sh
npm run demo-backend                                     # http://127.0.0.1:4700
FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4700 npm start   # friend-map in front of it
npm run contract-check -- http://127.0.0.1:4700          # every route it serves fits contract 1.0.0
```

It needs nothing installed beyond friend-map's own Node: the database is Node's built-in `node:sqlite`, the server `node:http`. It imports the contract's types and a few of its helpers from `src/archive.ts`, and the crowd's generator from `src/demo/` to seed itself; friend-map's code does not import it.

## What it serves

| Capability | Routes | File |
|---|---|---|
| `map` | `GET /contract`, `/people`, `/people/:id`, `/relationships` | `server.ts` (the handshake), `map.ts` |
| `panel` | `GET /people/:id/groups`, `/groups/:id`, `/people/:id/calls`, `/catch-ups`, `/calls/:id` | `panel.ts` |
| `content` | `GET /content/people/:id/timeline`, `/content/conversations/:id/messages` | `content.ts` |
| `table` | `GET /table-rows`, `/calls`, `/locations`, `/tags` | `table.ts` |
| `calendar` | `GET /calendar/:month`, `/calendar/:day`, `/content/conversations/:id/days/:day` | `calendar.ts` |
| `river` | `GET /message-apps` | `river.ts` |
| `events` | `GET /events` (server-sent events) | `server.ts` |
| `edit.people` | `POST /people`; `PUT /people/:id/names`, `/tags`, `/note`, `/should-reach-out`, `/location`, `/identicon` | `edit.ts` |

With these, friend-map offers every view: the map views, the Table, the Calendar and the Time river, and the person panel with its group chats, calls, hangouts and messages. It scores closeness itself, from `/relationships`, so this backend never scores anyone.

It leaves out the rest, and friend-map does without: `score-report` (friend-map scores from the map's report), `query` (the page runs the query language itself), `identity` and `changes` (no merge proposals, no change log, so no Undo), the other edits, and attachment files. A route it does not serve answers 404.

## How it is built

**What it holds** is `schema.sql`: people (you among them, `is_you`), tags, accounts, chats and who is in them, messages, and hangouts (the contract's "catch-ups"). That is all a backend keeps; every answer is counted from these tables when friend-map asks. Two choices make that easy:

- Each message keeps its **local day** (`messages.day`, `YYYY-MM-DD` in the time zone the handshake names), written when it is stored, so days and months are a `GROUP BY` away and every answer counts them the same way.
- A **call** is a message in a one-to-one chat with `call_seconds` (0 for one never answered), so calls come from the same table and are left out of message counts with `call_seconds IS NULL`.

Three views spare every query the same joins: `message_facts` (a message with its chat's type and platform, its month and whether you sent it), `chat_people` (each chat's people, once each) and `direct_with` (a one-to-one chat's other person).

**Seeding** (`seed.ts`) writes the demo's crowd (`src/demo/generate.ts`) into a new database, as of the day it runs. Who the backend's rules take off the map (people met only in big group chats, deleted accounts...) is decided there, by the demo's own rules, and kept as `people.archive_rule`; the tags `archive` and `keep`, and any change you make to someone, win over it (`archivedOf` in `people.ts`).

**Routes** are plain lists, one per capability (`MAP` in `map.ts`, `PANEL` in `panel.ts`...): a method, a path as the contract writes it, and an answer worked out from the database. `server.ts` matches requests to them, sends their answers as JSON, and answers the handshake with the capabilities of the routes it has, so adding a capability is adding its list. Errors are `{ error }` with the contract's status (`Refusal` in `http.ts`).

**People** (`people.ts`) are built once for every route that answers someone: their row, their tags, and their accounts with messages counted (one-to-one both ways, and what they sent in group chats).

**The map's report** (`map.ts`) counts each person's messages per month the contract's four ways, in three queries: one-to-one from you and from them, what they sent in group chats, and what you sent in the group chats they are in. Group chats (with their months and who wrote), hangouts and days with calls come with it.

**Pages of messages** (`content.ts`) go by a cursor, `sentAt:id` of the message a page ended on, compared as a pair in SQL (`(sent_at, id) < (?, ?)`), so a page never shifts as messages come in.

**Writes** (`edit.ts`) change the database file at once, so they outlast a restart; each answers the person after it, with `changeset: null` as there is no change log. A write is refused unless it came from friend-map's own page (its `Origin` is the `Host` it was sent to), and after each the event stream sends `people`, so the open page draws it.

**Speed.** Whatever is worked out from the tables is kept until the next change (`Db.memo`), and every read carries an ETag that changes with every write, which friend-map's server uses to keep its own copy. The map's report of the whole crowd takes under a second the first time, and nothing after.

## Building your own

The same tables and the same SQL work in any language with SQLite. Start from the four `map` routes (`server/fixtures/fourRouteBackend.ts` is them alone, in about 80 lines), point friend-map at your backend, and add a capability at a time, running `npm run contract-check -- <url>` after each: it asks every route your handshake declares and says what does not fit, by route and field.
