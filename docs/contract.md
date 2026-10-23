# The data contract: building a backend for friend-map

friend-map is a front end. It draws the map, scores closeness and lets you change people, but it keeps none of their data. The people, their accounts and their messages live in a **backend**: another program, in any language, that answers a set of HTTP routes under `/api/archive`. This page is that set of routes, **contract 1.1.0**: what a backend holds, what it must serve, what it may serve, and how to build one, starting with four routes.

The contract in code is `src/archive.ts`: every answer's type, the version (`CONTRACT_VERSION`), the capabilities (`CAPABILITIES`) and every route (`ROUTES`). Beside this page:

- [`contract/shapes.md`](contract/shapes.md): every object an answer holds, field by field, with which fields are required, which a backend may leave out, and what friend-map puts in their place.
- [`contract/examples/`](contract/examples/): real answers. `demo/` holds the answer of the demo's in-page backend (`src/demo/archive.ts`) to every route it serves; `minimal/` holds the smallest backend's four answers. Both are made of made-up people, and `npm run contract-examples` writes them again.
- `npm run contract-check -- <url>`: asks a backend every route it says it serves, and says which answers do not fit, by route and field.

## How the pieces fit

```
browser ──> friend-map's server (npm start, port 4600) ──> your backend (FRIEND_MAP_ARCHIVE_URL)
            the page, its own settings and photo           /api/archive/...: people, messages,
            (/api/settings, /api/me), the scoring           hangouts, calls, and every change
            (/api/archive/table, .../activity)
```

The page asks friend-map's server for everything under `/api/archive`. friend-map's server passes those requests to your backend as they came, streaming both ways, and answers three routes itself:

- **`GET /api/archive/contract`**: your handshake, with `scores` added.
- **`GET /api/archive/table`** and **`GET /api/archive/people/:id/activity`**: the Table's and the Events chart's closeness scores, worked out from your facts by friend-map's own methodology.

So a backend never scores anyone: it gives facts, and friend-map does the scoring.

## Build your own backend

The smallest backend that runs the map serves four routes and fills only the fields the contract requires. This walkthrough builds that backend, then grows it.

### 1. Decide what your backend holds

The contract's words, as a backend holds them:

- **You**: the owner of the map, the sun at its centre. Answers say "you" and "yours" (`directFromMe` counts what you sent).
- **Person**: someone you know, with a numeric `id` and a `name`, and optionally aliases, tags, a location and a note. One person may have several **accounts** (one per platform: Signal, SMS, WhatsApp...).
- **Chat**: one-to-one (`direct`) or a **group chat**. friend-map never needs your messages to draw the map: it needs them **counted**, per person and per month, split by who sent them.
- **Hangout** (a "catch-up" in the code): time you spent with people, on a day, for some hours.
- **Call**: an answered call, counted by day and length.
- **Tag**: a lowercase word with dashes for spaces. Four are built in (`BUILT_IN_TAGS` in `src/archive.ts`): `archive` takes someone off the map, `keep` keeps them out of any automatic archiving, `live-together` puts them next to the sun, and `show-name` picks them for the "No name except…" name choice.
- **Archived**: someone off the map. Your backend decides who; the map leaves them out of `/relationships`.
- **Days and months** are local: `YYYY-MM-DD` and `YYYY-MM`, in the time zone your handshake names. Moments are numbers: milliseconds since the epoch.

### 2. Serve the handshake

`GET /api/archive/contract` says which contract your backend serves, what of it, and in which time zone:

```json
{ "version": "1.0.0", "capabilities": ["map"], "timeZone": "Europe/Berlin" }
```

friend-map refuses a backend of another major version (2.x, say), one without `map`, or a time zone that is no IANA name. It then shows a page saying why, in place of the map. It counts days and months in your time zone from then on, the page and the server alike.

### 3. Serve your people

`GET /api/archive/people` lists everyone. `GET /api/archive/people/:id` answers one person, or `404` with `{ "error": "..." }` for an id you do not have.

```json
{ "people": [{ "id": 101, "name": "Ada Sample" }, { "id": 102, "name": "Bruno Placeholder" }] }
```

```json
{ "id": 101, "name": "Ada Sample" }
```

Everything else about a person is optional: aliases, tags, note, location, accounts with their counts, an identicon seed and more. friend-map fills in each field you leave out, from what you did send where it can (a person's message count is the sum of their accounts'). [`shapes.md`](contract/shapes.md#personsummary) lists every field and its default.

### 4. Serve the map's report

`GET /api/archive/relationships` is what every map view draws: everyone on the map, with their messages counted per month.

```json
{
  "people": [
    {
      "id": 101,
      "name": "Ada Sample",
      "months": [
        { "month": "2026-08", "directFromMe": 34, "directFromThem": 38, "groupFromMe": 0, "groupFromThem": 0 },
        { "month": "2026-09", "directFromMe": 40, "directFromThem": 44, "groupFromMe": 0, "groupFromThem": 0 }
      ]
    }
  ],
  "groups": [{ "id": 1, "memberIds": [101, 102, 103, 104] }],
  "catchUps": [{ "id": 1, "day": "2026-09-02", "hours": 3, "personIds": [101, 102] }]
}
```

- **`months`** is required: for each month with any messages, how many one-to-one messages you sent them (`directFromMe`), and they you (`directFromThem`). Also how many you sent in group chats they are in (`groupFromMe`), and they sent in group chats (`groupFromThem`). Leave out months with none.
- **`groups`**, **`catchUps`** and **`callDays`** are optional, and each adds to closeness: group chats link people who share them, and hangouts and calls count as time together.
- Every other field has a default (see [`RelationshipsReport`](contract/shapes.md#relationshipsreport)).

The whole minimal answer is in [`examples/minimal/relationships.json`](contract/examples/minimal/relationships.json).

### 5. Point friend-map at it

```sh
FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:5000 npm start
```

Open <http://localhost:4600/>. The Spider web, Orbits, Orbits 3D, Circles, the City and the frozen views draw your people, and Methodology explains the scores. The find box, Names and the person panel's header work too. So do the Query bar (friend-map runs its query language in the page, over `GET /people`) and the person panel's Events chart (friend-map scores it from your map's report).

The Table, the Calendar and the Time river need more than the map, so they are not offered yet (step 7).

### 6. Check it

```sh
npm run contract-check -- http://127.0.0.1:5000
```

```
contract-check of http://127.0.0.1:5000: contract 1.0.0, 1 capabilities (map)
ok   GET /contract [map]
ok   GET /people [map]
ok   GET /relationships [map]
ok   GET /people/:id [map]
ok   GET /people/:id (someone not there) [map]
Every route fits contract 1.0.0.
```

It only reads, and it says what is wrong by route and field ("`people[*].name should be a string, not a number (12 places)`"), never what an answer holds. That makes its output safe to paste into an issue. It exits 1 while anything does not fit.

`server/fixtures/fourRouteBackend.ts` is this backend in full, in about 80 lines of Node. friend-map's tests run the Spider web and Orbits on it.

### 7. Add capabilities one at a time

Each capability you add to your handshake lights up part of the app:

| Capability | What it adds |
|---|---|
| `score-report` | The facts closeness is scored from, everyone's, archived people too. Without it friend-map scores from your map's report, the people on the map only. |
| `query` | The Query bar's answers from your backend, which can then also reveal archived people a query matches. |
| `panel` | The person panel's group chats, calls and hangouts. |
| `content` | The person panel's messages, and attachment files. |
| `table` | The Table, with its People, Hangouts and Calls tabs. friend-map scores its closeness column. |
| `calendar` | The Calendar (with `content` for a day's messages). |
| `river` | The Time river. |
| `events` | Live reload: the page draws again when people or messages change. |
| `identity` | The People list's merge proposals. |
| `changes` | The change log, in the Changes panel. |
| `edit.people`, `edit.tags`, `edit.identity`, `edit.hangouts`, `edit.calls`, `edit.groups` | Changing people, tags, who is who, hangouts, calls and group links from the app. |
| `edit.undo` | Each change's Undo chip. |

Add the capability's routes (under [Every route](#every-route) below), say so in your handshake, and run `contract-check` again: it then asks the new routes too. A route you do not serve answers `404`, which the page reads as "not here". A view whose capability your backend does not serve is not offered, and neither are the person panel's hangouts and group chats without `panel`.

### 8. See a whole one

The **demo backend** (`examples/demo-backend/`, `npm run demo-backend`) is this backend grown to eight capabilities: `map`, `panel`, `content`, `table`, `calendar`, `river`, `events` and `edit.people`, which light up every view. It keeps the public demo's made-up crowd in a SQLite file (Node's own `node:sqlite`, nothing to install) and counts every answer from its tables in plain SQL, a file per capability. Its [README](../examples/demo-backend/README.md) walks through how it is built: what it holds, how days are kept in its time zone, how the map's report is counted, how messages are paged, and how it takes a change and tells the page. `contract-check` passes it, and friend-map's tests run it behind friend-map's server.

## Transport

- **Routes** are under `/api/archive`, in JSON, with the methods each route names. A route you do not serve answers `404`.
- **Errors** are JSON too, `{ "error": "what is wrong, in a sentence" }`, which the page shows as it is:
  - `400`: what was sent is wrong, such as a query that does not parse or a field out of range;
  - `404`: not there, whether an id you do not have or a route you do not serve;
  - `409`: a change that clashes with another, such as an Undo of a change made since;
  - `503`: the backend cannot answer right now, and the page says the archive is unavailable (to the handshake, the page shows in place of the app that no backend is running, with your words, and opens the app once the handshake answers).
- **Two paths**: the structure (people, counts, dates; never message text) is under `/api/archive/...`. Message text and attachment files are under `/api/archive/content/...`, so a stricter policy can be put on that path alone.
- **The archive's folder**: friend-map sends `x-archive-folder` with every request, naming the data folder it was given (`FRIEND_MAP_ARCHIVE_FOLDER`). A backend that keeps its data in a folder may answer `503` to a request naming another, so a friend-map started on a testing folder never meets real data. A backend with no such folder ignores it.
- **Live reload** (`events`): `GET /api/archive/events` is a stream of server-sent events. Send an event named `people` whenever anyone changes, and one named `messages` when new messages come in.
- **Security**: friend-map passes `Host`, `Origin` and `Sec-Fetch-Site` through as the browser sent them. A backend that takes writes must refuse a write whose `Origin` is not friend-map's own page, so another site open in the same browser cannot change your data. Bind it to `127.0.0.1` unless you mean to serve it further.

## Writes: the update format

Each change is one operation: one route, one typed payload, one answer. Every write answers the thing after the change, and the **changeset** that made it, a number its Undo chip passes back to `POST /api/archive/changes/:id/undo`. A backend that keeps no change log answers `"changeset": null`, and the page then offers no Undo.

Some payloads, as a write sends them:

```jsonc
// POST /api/archive/people (NewPerson): someone added by hand
{ "name": "Ada Sample", "location": "Lisbon", "tags": ["climbing"], "note": "", "anyway": false }

// POST /api/archive/catch-ups (CatchUpInput): a hangout
{ "day": "2026-09-02", "time": "19:30", "trip": null, "hours": 3, "byCall": false, "note": "", "personIds": [101, 102], "others": 0 }

// POST /api/archive/calls (ManualCallInput): a call you log
{ "people": [{ "personId": 101, "accountId": null, "app": "phone" }], "day": "2026-09-03", "time": "18:00", "minutes": 40, "note": "" }

// PUT /api/archive/call-notes: a note on any call, wherever it came from (CallRef says which)
{ "call": { "kind": "logged", "id": 7 }, "note": "her new job" }
```

[Every route](#every-route) lists each write's payload and answer, and `src/archive.ts` writes out each type.

## Versioning

`CONTRACT_VERSION` is semver.

- A **minor** version adds something optional: a route, a field or a capability.
- A **major** version removes, renames or changes the meaning of anything.

What each minor version added:

- **1.1.0**: `callAnswer` on a call record in the chat (TimelineMessage), whether you said it was answered (`PUT /call-answered`), so the chat can show a call you said had no answer, and take it back. A backend before it leaves it out, and the chat reads that as no answer of yours.

friend-map reads any 1.x backend. A capability name it does not know is passed over. A backend with **no handshake at all** (`GET /contract` answers 404) is taken to be one from before contract 1.0: it is assumed to serve every capability, in friend-map's own time zone. That covers the author's backend until it serves a handshake; contract 2.0 drops it, and `contract-check` already fails such a backend.

## What friend-map does without a capability

| Without | friend-map |
|---|---|
| A field the `map` answers may leave out | puts its default in its place ([`shapes.md`](contract/shapes.md)) |
| `score-report` | scores closeness from `GET /relationships`: the same facts, for the people on the map |
| `query` | runs the query language in the page (`src/pageQuery.ts`), over `GET /people` and the map's group chats; SQL needs `query.sql`; archived people are never revealed |
| `table`, `calendar`, `river` | does not offer the Table, the Calendar or the Time river |
| any other | finds its routes not there (404) and leaves that part out |

## Extensions

These are the life archive's own: part of the contract, but no backend needs them, and the page does without them.

- **`query.sql`**: the Query bar takes SQL (a query starting `SELECT` or `WITH`), run read-only over the backend's tables.
- **`query.generate`**: the Query bar's Generate, a query written by a model from what you say.
- **`drafts`** and **`send`**: the person panel's draft box, and its composer, which sends a message through a connected platform.
- **`map-facts`**: the counts `npm run demo-shape` shapes the demo's made-up crowd by.
- **Fields** marked "extension" in [`shapes.md`](contract/shapes.md): a note from the address book, archive rules, how an account was linked, Marketplace chats, chats that keep only your side.

## Other ways in

- **A backend in the page.** `ArchiveApi` (`src/archiveApi.ts`) is the contract bound to the page; `src/archiveHttp.ts` is it over HTTP. Implement `ArchiveApi` in TypeScript and give it to `provideArchive` from your own entry, as the demo's entry does (`src/demo/main.tsx`), and friend-map runs with no server at all. `src/contract/routes.ts` (`servedBy`) turns any `ArchiveApi` into the routes above, which is how `contract-check` checks the demo (`npm run contract-check -- --demo`). An HTTP server handing each request to it would serve that `ArchiveApi` as a backend.
- **The demo's in-page backend** (`src/demo/archive.ts`) is the static demo's: the made-up crowd held in the page, with no server. It serves `map`, `query`, `panel` and `content`, and scores the Events chart itself. It does not answer the Table, the Calendar, the Time river or the calls list yet, so those routes' examples are not in `examples/demo/`.

## Every route

Each route under `/api/archive`, by capability: what it is sent and what it answers. A shape name links to its fields in `shapes.md`, and each read has examples from the demo's in-page backend and from the four-route one, where they serve it.

<!-- routes: written by npm run contract-examples from ROUTES in src/archive.ts -->
### `map` (required)

Required. The map views (the Spider web, Orbits, Orbits 3D, Circles, the City, the frozen views), Methodology, the find box, Names, the person panel's header and its Events chart.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /contract` |  | [Contract](contract/shapes.md#contract) | [demo](contract/examples/demo/contract.json), [minimal](contract/examples/minimal/contract.json) |
| `GET /relationships` | query: `q=<query>&reveal=archive` (with `query` only) | [RelationshipsReport](contract/shapes.md#relationshipsreport) | [demo](contract/examples/demo/relationships.json), [minimal](contract/examples/minimal/relationships.json) |
| `GET /people` | query: `query=<words>&tag=<tag>` (both optional) | [PeopleListing](contract/shapes.md#peoplelisting) | [demo](contract/examples/demo/people.json), [minimal](contract/examples/minimal/people.json) |
| `GET /people/:id` |  | [PersonSummary](contract/shapes.md#personsummary) | [demo](contract/examples/demo/people-id.json), [minimal](contract/examples/minimal/people-id.json) |

### `score-report`

The facts closeness is scored from, everyone's; without it friend-map works them out from the map's report (the people on the map only).

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /score-report` |  | [ScoreReport](contract/shapes.md#scorereport) |  |

### `query`

The Query bar's answers from the backend; without it the page runs the query language itself, over GET /people.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /query` | query: `q=<query>&hide=<tag>` (hide repeated, optional) | [QueryResult](contract/shapes.md#queryresult) | [demo](contract/examples/demo/query.json) |

### `query.sql`

Extension: SQL in the Query bar (a query starting SELECT or WITH).

No route of its own: it changes what `GET /query` takes.

### `query.generate`

Extension: the Query bar's Generate, a query written by a model from what you say.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /query/generate` | body: `{ query: string; transcript: string }` | [GeneratedQuery](contract/shapes.md#generatedquery) |  |

### `panel`

The person panel's group chats, calls and hangouts.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /people/:id/groups` |  | [PersonGroup[]](contract/shapes.md#persongroup) | [demo](contract/examples/demo/people-id-groups.json) |
| `GET /groups/:id` |  | [GroupChat](contract/shapes.md#groupchat) | [demo](contract/examples/demo/groups-id.json) |
| `GET /people/:id/calls` | query: `account=<account id>` (optional) | [PersonCall[]](contract/shapes.md#personcall) | [demo](contract/examples/demo/people-id-calls.json) |
| `GET /catch-ups` | query: `person=<person id>` (optional) | [CatchUp[]](contract/shapes.md#catchup) | [demo](contract/examples/demo/catch-ups.json) |
| `GET /calls/:id` |  | [LoggedCall](contract/shapes.md#loggedcall) |  |

### `content`

The person panel's messages, and attachment files.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /content/people/:id/timeline` | query: `before=&after=&limit=&count=1&groups=1&marketplace=1&account=` (all optional) | [TimelinePage](contract/shapes.md#timelinepage) | [demo](contract/examples/demo/content-people-id-timeline.json) |
| `GET /content/conversations/:id/messages` | query: `before=&after=&limit=&count=1` (all optional) | [TimelinePage](contract/shapes.md#timelinepage) | [demo](contract/examples/demo/content-conversations-id-messages.json) |
| `GET /content/attachments/:id` |  | file |  |

### `table`

The Table (its People, Hangouts and Calls tabs), scored by friend-map.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /table-rows` |  | [TableRow[]](contract/shapes.md#tablerow) |  |
| `GET /calls` |  | [ListedCall[]](contract/shapes.md#listedcall) |  |
| `GET /locations` |  | [LocationInfo[]](contract/shapes.md#locationinfo) |  |
| `GET /tags` |  | [TagInfo[]](contract/shapes.md#taginfo) |  |

It reads `GET /catch-ups` too, which are listed above.

### `calendar`

The Calendar, with `content` for a day's messages.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /calendar/:month` |  | [CalendarMonth](contract/shapes.md#calendarmonth) |  |
| `GET /calendar/:day` |  | [CalendarDay](contract/shapes.md#calendarday) |  |
| `GET /content/conversations/:id/days/:day` | query: `after=&limit=` (optional) | [DayMessagesPage](contract/shapes.md#daymessagespage) |  |

### `river`

The Time river: GET /message-apps, with /catch-ups and /calls (under `panel` and `table` below), which it reads too.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /message-apps` |  | [MessageApps[]](contract/shapes.md#messageapps) |  |

It reads `GET /catch-ups` and `GET /calls` too, which are listed above.

### `events`

Live reload: the page draws again when people or messages change.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /events` |  | events |  |

### `identity`

The People list's merge proposals.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /merge-proposals` |  | [MergeProposal[]](contract/shapes.md#mergeproposal) |  |

### `changes`

The change log (the Changes panel).

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /changes` | query: `limit=<n>` (optional) | [ChangesetInfo[]](contract/shapes.md#changesetinfo) |  |
| `GET /changes/:id` |  | [ChangesetInfo](contract/shapes.md#changesetinfo) |  |

### `drafts`

Extension: the person panel's draft box.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /people/:id/drafts` |  | [Draft[]](contract/shapes.md#draft) |  |
| `POST /people/:id/drafts` | body: `{ text: string }` | [Draft \| null](contract/shapes.md#draft) |  |
| `PUT /drafts/:id` | body: `{ text: string }` | [Draft \| null](contract/shapes.md#draft) |  |

### `send`

Extension: the person panel's composer, which sends a message.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /people/:id/send-targets` |  | [SendTarget[]](contract/shapes.md#sendtarget) |  |
| `POST /content/conversations/:id/send` | body: `{ text: string }` | [SendResult](contract/shapes.md#sendresult) |  |

### `map-facts`

Extension: the counts the static demo's shape is worked out from (npm run demo-shape).

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /map-facts` |  | [MapFacts](contract/shapes.md#mapfacts) |  |

### `edit.people`

Adding people and changing their names, tags, note, reach-out, location and identicon.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /people` | body: `NewPerson` | [PersonAdded](contract/shapes.md#personadded) |  |
| `PUT /people/:id/names` | body: `{ names: string[] }` | [PersonSaved](contract/shapes.md#personsaved) |  |
| `PUT /people/:id/tags` | body: `{ tags: string[] }` | [TagsSaved](contract/shapes.md#tagssaved) |  |
| `PUT /people/:id/note` | body: `{ note: string }` | [PersonSummary](contract/shapes.md#personsummary) |  |
| `PUT /people/:id/should-reach-out` | body: `{ shouldReachOut: boolean }` | [PersonSummary](contract/shapes.md#personsummary) |  |
| `PUT /people/:id/location` | body: `{ location: string | null }` | [PersonSaved](contract/shapes.md#personsaved) |  |
| `PUT /people/:id/identicon` | body: `{ seed: string; hue: number | null }` | [PersonSaved](contract/shapes.md#personsaved) |  |

### `edit.tags`

Making, renaming, moving and deleting tags.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /tags` | body: `{ name: string }` | [TagsChanged](contract/shapes.md#tagschanged) |  |
| `PUT /tags/:name` | body: `{ name: string }` | [TagsChanged](contract/shapes.md#tagschanged) |  |
| `PUT /tags/:name/position` | body: `{ position: number }` | [TagsChanged](contract/shapes.md#tagschanged) |  |
| `DELETE /tags/:name` |  | [TagsChanged](contract/shapes.md#tagschanged) |  |

### `edit.identity`

Joining two people into one, taking an account off someone, answering merge proposals.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /people/:id/merge` | body: `{ with: number }` | [PersonSummary](contract/shapes.md#personsummary) |  |
| `POST /people/:id/accounts/:accountId/detach` |  | [PersonSummary](contract/shapes.md#personsummary) |  |
| `POST /merge-proposals/:id/confirm` |  | [PersonSummary](contract/shapes.md#personsummary) |  |
| `POST /merge-proposals/:id/reject` |  | null |  |

### `edit.hangouts`

Adding, changing and deleting hangouts.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /catch-ups` | body: `CatchUpInput` | [CatchUpSaved](contract/shapes.md#catchupsaved) |  |
| `PUT /catch-ups/:id` | body: `CatchUpInput` | [CatchUpSaved](contract/shapes.md#catchupsaved) |  |
| `DELETE /catch-ups/:id` |  | [CatchUpSaved](contract/shapes.md#catchupsaved) |  |
| `POST /catch-ups/:id/call` | body: `ManualCallInput` | [ManualCallSaved](contract/shapes.md#manualcallsaved) |  |

### `edit.calls`

Logging calls, and their lengths, notes and answers.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /calls` | body: `ManualCallInput` | [ManualCallSaved](contract/shapes.md#manualcallsaved) |  |
| `PUT /calls/:id` | body: `ManualCallInput` | [ManualCallSaved](contract/shapes.md#manualcallsaved) |  |
| `DELETE /calls/:id` |  | [ManualCallSaved](contract/shapes.md#manualcallsaved) |  |
| `POST /calls/:id/catch-up` | body: `CatchUpInput` | [CatchUpSaved](contract/shapes.md#catchupsaved) |  |
| `PUT /messages/:id/call-length` | body: `{ minutes: number | null }` | [CallLengthSaved](contract/shapes.md#calllengthsaved) |  |
| `PUT /call-notes` | body: `{ call: CallRef; note: string }` | [CallNoteSaved](contract/shapes.md#callnotesaved) |  |
| `PUT /call-answered` | body: `{ call: CallRef; answered: CallAnswer }` | [CallAnsweredSaved](contract/shapes.md#callansweredsaved) |  |

### `edit.groups`

Unlinking someone from a group chat, archiving a group chat's untouched people.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `PUT /people/:id/groups/:groupId/unlinked` | body: `{ unlinked: boolean }` | [GroupUnlinkSaved](contract/shapes.md#groupunlinksaved) |  |
| `POST /groups/:id/archive-untouched` | body: `{ people: number[] }` | [ArchivedUntouched](contract/shapes.md#archiveduntouched) |  |

### `edit.undo`

Every change's Undo chip.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `POST /changes/:id/undo` | body: `{}` | [ChangesetInfo](contract/shapes.md#changesetinfo) |  |

### `scores` (friend-map's own)

friend-map's own, never a backend's: friend-map's server scores the Table and the Events chart, and adds this to the capabilities it passes on.

| Request | Sent | Answer | Examples |
|---|---|---|---|
| `GET /table` | query: `<closeness settings>` (each optional) | [PeopleTable](contract/shapes.md#peopletable) |  |
| `GET /people/:id/activity` | query: `<closeness settings>` (each optional) | [PersonActivity](contract/shapes.md#personactivity) | [demo](contract/examples/demo/people-id-activity.json) |
<!-- /routes -->
