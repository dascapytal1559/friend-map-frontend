# Running friend-map

friend-map is the map and its views: a front end, with no database of its own. The people and messages it draws come from a **backend**, another process that answers the routes of friend-map's **data contract** under `/api/archive` ([`docs/contract.md`](contract.md), the shapes in `src/archive.ts`), and is the only one that opens the archive. Any program that serves the contract's four required routes runs the map; see [Bring your own backend](#bring-your-own-backend). To try friend-map without one of your own, run it on the demo backend, a crowd of made-up people (see [Run friend-map with the demo backend](#run-friend-map-with-the-demo-backend)). The author's backend is the **life archive**, a project of its own (`~/Projects/life-archive`, not published) that keeps the people, their messages, the connectors that import them and a command line to change them; its README says how people and messages are kept, joined, archived and changed. You change people in the app, which asks the backend, and the open page picks up changes made anywhere else.

## Starting it

Runs on Node 24.21.0 only (the server runs TypeScript directly), pinned in `package.json`'s `devEngines.runtime`. The Vite+ shims in `~/.vite-plus/bin` read the pin and run that version here, so put them first on the PATH; `npm test`, `npm start` and `npm run check-settings` stop on any other Node with a message saying so (`server/nodeVersion.ts`), so a result never depends on which Node the PATH found first.

```sh
export PATH="$HOME/.vite-plus/bin:$PATH"
npm install
npm start
```

Then open <http://localhost:4600/>. `npm start` runs friend-map's server (`server/main.ts`): its own data API under `/api`, the page through Vite with hot reload on the same port, and `/api/archive`, where it answers the Table and the activity chart itself from the backend's facts (see [The Table](views.md#each-view)) and passes every other request to the backend as it came, streaming both ways (`server/archiveProxy.ts`). friend-map finds the backend at `FRIEND_MAP_ARCHIVE_URL` (the environment or `.env.local`; `http://127.0.0.1:4650` unless set; `LIFE_ARCHIVE_URL`, its old name, is read too). While the backend is down, starting again or nowhere (a clone with no backend), the archive's routes answer 503. A page opened then says no backend is running, points at the demo and the demo backend, and opens the map by itself once one answers (`src/NoBackend.tsx`); a page already open says the archive is unavailable where it needs it, the rest of it works, and the change stream connects again by itself. `/demo` needs no backend (the map views on a made-up crowd held in the page, see [Demo](demo.md)). Set `PORT` to put friend-map on another port. friend-map's own files are in its data folder (see [The data folder](#the-data-folder)). On every request to the backend friend-map names the archive's folder it was given, in the `x-archive-folder` header: `FRIEND_MAP_ARCHIVE_FOLDER` (the environment or `.env.local`; `LIFE_ARCHIVE_DATA`, its old name, is read too), else the data folder. The first of the environment and `.env.local` that names either folder decides both, so `FRIEND_MAP_DATA=<testing folder>` in the environment alone runs on that folder for both. A backend that keeps another folder answers 503, so friend-map on a testing folder never meets the real archive; a backend may ignore the header. It is meant for development use in a browser on this machine only.

With the life archive as the backend, its `npm start` runs it on port 4650, on this machine alone: it answers the archive's routes, runs the live connectors (each only while it is switched on) and the AI service, and stops them when it stops; its README says how it runs and how its code is laid out. A path under `server/archive/`, `server/connectors/` or `server/fixtures/` (but `madeUpNames.ts`), and `testing-data/` or `docs/import-runbook.md`, named here or in the code's comments, is the life archive's, at the same path. Its commands (`npm run archive`, its `check-data`) run in its own folder.

## From your phone

Tailscale Serve can put the page on the tailnet (only your own devices) while the server stays on 127.0.0.1, at friend-map's own path, so other apps can share the machine's address under paths of their own:

```sh
tailscale serve --bg --set-path /friend-map http://127.0.0.1:4600/friend-map
```

Then tell the server the machine's Tailscale name, in the environment or in `.env.local` (gitignored), and restart it:

```sh
echo 'FRIEND_MAP_ALLOWED_HOSTS=your-mac.tail1234.ts.net' >> .env.local
```

Open <https://your-mac.tail1234.ts.net/friend-map/> on the phone. The server answers every address at the root and again under `/friend-map` (`server/basePath.ts`): Vite's base is `/friend-map/`, so the page's modules and its hot-reload websocket are always asked for under it, and the page keeps its links, history and requests to the server under whichever it was opened at (`src/mount.ts`), so <http://localhost:4600/> works as ever. The address the route proxies to ends in `/friend-map` so that Tailscale passes the path on whole; a route to `http://127.0.0.1:4600` alone, which takes `/friend-map` off first, works too. `FRIEND_MAP_ALLOWED_HOSTS` is a comma-separated list of exact names that may reach the server besides localhost, 127.0.0.1 and [::1]; the server refuses any other Host with 403 before the API, media, the page or its hot-reload websocket see the request (`guardHosts` in `server/allowedHosts.ts`, with the list Vite reads), which keeps DNS-rebinding pages off the page and the archive alike. friend-map passes the page's Host on to the backend, which should refuse a Host it does not know the same way (the life archive admits the same names, and any in its `LIFE_ARCHIVE_ALLOWED_HOSTS`). Sending messages works too, since the page's Origin and the Host Tailscale passes on are the same name and port.

On the phone the page is laid out for it (media queries for a narrow screen, a short one held sideways, and touch, so a laptop sees no change): a person's panel, People and the frozen views' panel take the whole screen, with × and the back arrow at the top; the header closes up to three rows (the title with Names and People, then the find box and Methodology as its icon, or the Table's Tags and Changes, then the Query bar); the Table scrolls sideways with the names held at the left; fields are 16 px, so the iPhone does not zoom in on them; and buttons are big enough for a finger. On Orbits two fingers pinch to zoom and one drags to pan (starting on someone too), a tap opens someone's panel, and a finger held on someone shows their hover card, above the finger, until it lets go (which opens nothing). Orbits and Circles name nobody on a phone, however far zoomed in: not the closest, not people to reach out to, not the people a held person shares group chats with, nor the friend circles' arcs; only whoever is picked out (a finger held on them, or their panel open) is named. The frozen views get the full-screen panel but keep their hover-only cards.

## Inside the console

The life archive's console embeds friend-map whole, as it runs, in a frame (its Social aspect; `viewer/console/SocialView.tsx` there), and friend-map takes the console's look, light or dark, so one switch, the console's, rules inside it (see [Look](settings.md#look)). Any page that embeds friend-map can do the same, two ways, both read by `src/theme.ts`:

- **On the address**: `?theme=light` or `?theme=dark` on the page's address (`http://127.0.0.1:4600/friend-map/?theme=light`) sets the look for as long as the page is open, whatever is chosen in friend-map's own menu. The address of a view switched to inside the page carries no query, so the parameter is read once as the page opens, not again at every view.
- **By a message**, as the embedder's look flips, with no reload: the embedding page posts `{ type: "friend-map:theme", theme: "light" }` (or `"dark"`) to the frame's window (`frame.contentWindow.postMessage(message, friendMapOrigin)`), and friend-map takes it from its parent page alone; any other message, or one from anywhere else, is ignored.

Opened on its own, friend-map hears nothing and follows its own Look choice, the device's setting until one is made. Orbits 3D and the City, night scenes, stay dark under either look.

## Tests, and trying it without real data

```sh
npm test          # HTTP APIs, the proxy and the scoring routes, the settings check, relationships,
                  # view models and layouts, usage tracking, local dates, settings, trends, the demo, the contract
                  # and the demo backend (a backend's own tests are its own)
npm run typecheck
```

To try things without real data, run friend-map on the demo backend (see [Run friend-map with the demo backend](#run-friend-map-with-the-demo-backend)), on ports of their own if a friend-map is already running: `PORT=4701 npm run demo-backend`, then `FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4701 PORT=4611 npm start`.

With the life archive as the backend, build a data folder from its testing data instead (the small made-up Messenger export and the six made-up people in its `testing-data/`), run its server on it on a port of its own, beside the real one, and friend-map in front of it:

```sh
# in ~/Projects/life-archive:
npm run testing-data -- /tmp/friend-map-testing
LIFE_ARCHIVE_DATA=/tmp/friend-map-testing LIFE_ARCHIVE_URL=http://127.0.0.1:4651 npm start &
# here:
FRIEND_MAP_DATA=/tmp/friend-map-testing FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4651 PORT=4611 npm start
```

## Which views are used

While a view is open and the page is visible, the page records which view it is, when you opened it, and roughly how long it stayed visible (hidden time does not count; a view shown again after half an hour hidden counts as a new open). It goes to `data/usage.jsonl` through `POST /api/usage`, one line per report. Nothing leaves this Mac, and nothing records who was looked at.

```sh
npm run usage     # per view: last opened, opens and minutes in the last 30 days, and all time
```

It ends by naming the frozen views not opened in the last 30 days, to propose for removal (nothing is removed without a yes), or says to wait while there is less than 30 days of record. `node server/usage-report.ts <data directory>` reads another data directory.

## The data folder

friend-map keeps a few files of its own in its data folder: `data/` in this repository (gitignored), unless `FRIEND_MAP_DATA` names another. Like every setting here, it is read from the environment, then from `.env.local` (gitignored, `KEY=value` lines; a relative path is from the repository, `~/` the home folder), so nothing need be exported, and every entry point (the server, `check-settings`, `usage`, `check-demo`) finds it the same way (`server/dataHome.ts`). `check-demo` reads git config `friendmap.dataDir` and `friendmap.archiveDir` first, which is how a worktree with no `.env.local` of its own finds the main copy's folders. The people and messages are not here: they are the backend's.

```
data/                       # gitignored: the data folder (FRIEND_MAP_DATA, else data/)
  usage.jsonl               # which views you opened, when, and for how long (npm run usage)
  settings.json             # optional settings, such as how far back trends look (see "Settings")
  view-settings.json        # the Spider web's settings and the Reach-out glow, shared by every browser (see "Saved view settings")
  me/photo.<jpg|png|webp>   # your photo, drawn in place of the sun on Orbits (see "Orbits" under "The views")
```

## Run friend-map with the demo backend

The demo backend (`examples/demo-backend/`) is a small backend of made-up people, the public demo's crowd, to run friend-map on when you have no backend of your own. In two terminals:

```sh
npm run demo-backend                                     # the backend, at http://127.0.0.1:4700
FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4700 npm start   # friend-map in front of it, at http://localhost:4600
```

The first start makes its database, `examples/demo-backend/demo-backend.sqlite` (gitignored), in a few seconds: some 400 people on the map and 10,000 more off it, with their chats, half a million messages, calls and hangouts, dated up to that day. It serves the map, the person panel (group chats, calls, hangouts and messages), the Table, the Calendar and the Time river, and changing people (names, tags, note, reaching out, location, identicon). Changes are written to the database file, so they are kept when it starts again, and the open page draws them at once; `npm run demo-backend -- --fresh` makes the crowd again as of today, and drops every change. It keeps no change log, so there is no Undo, and it takes no other change: the page offers them (hangouts, calls, merging people, tags), and the backend answers that they are not there. `PORT` and `DEMO_BACKEND_FILE` give it another port and database.

It is also the worked example of the contract: plain SQL over Node's own SQLite, one file per capability. [Its README](../examples/demo-backend/README.md) walks through how it is built.

## Bring your own backend

friend-map runs on any backend that serves its data contract, version 1.1.0 (or any 1.x): [`docs/contract.md`](contract.md) is the builder's guide, with the data a backend holds, every route with its examples, which are required and what each optional one lights up, and a walkthrough from four routes up. A backend says in its handshake (`GET /api/archive/contract`) which contract it serves, what of it (its **capabilities**: `map` is the only one required) and its time zone, which every day and month in the app is counted in. friend-map then offers only the views it can serve (the Table, the Calendar and the Time river each need a capability of their own), fills in every field a minimal backend leaves out, runs the Query bar's language in the page when the backend does not, and scores the Events chart from the map's report when it has no score report. A backend of another major version gets a page saying why, in place of the map; one with no handshake at all is taken to be one from before the contract (the life archive, until it serves one), serving everything, in friend-map's own time zone.

```sh
FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:5000 npm start   # friend-map in front of your backend
npm run contract-check -- http://127.0.0.1:5000          # what of it does not fit the contract, route by route
npm run contract-check -- --demo                         # the demo's in-page backend (src/demo/archive.ts)
npm run contract-examples                                # docs/contract/: the examples and shapes, written again
```

`contract-check` only reads, and says only which routes and fields are wrong and how, never what an answer holds. `server/fixtures/fourRouteBackend.ts` is the smallest backend there is (the four `map` routes, the required fields alone), which the tests run the Spider web and Orbits on. The demo backend (see [Run friend-map with the demo backend](#run-friend-map-with-the-demo-backend)) is a whole one, grown from those four routes to eight capabilities.
