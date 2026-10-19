# friend-map

A map of someone's friendships, drawn from a backend that keeps their people and messages: Orbits at `/orbits` is the main view (the app opens on the Spider web, at `/spider`), and the older views are frozen.
README.md is the project's front page; docs/ explains how the app runs and how it is wired.

If an `AGENTS.local.md` exists beside this file, read it first: it is this checkout's own setup, and it wins where the two differ.

## Code changes

- Keep `npm test` and `npm run typecheck` passing (on the pinned Node), and add or update tests with behaviour changes.
- Tests and experiments never touch real data: not the data folder, a backend's archive or its folder.
- Never commit personal data, in code, comments, tests, fixtures, docs, screenshots or commit messages. Tests, fixtures and examples use only made-up people, with names from the pools in `server/fixtures/madeUpNames.ts` (the demo crowd's are in `src/demo/words.ts`); a test that needs a new one adds it there first.
- "Demo" means only the public demo and its generated crowd (`src/demo/`), and the demo backend that serves that crowd (`examples/demo-backend/`).
- New view work goes only to the main view (Orbits); frozen views are not extended, and when a change would break one, do not fix it by default: report it so the maintainer can decide with its usage (`npm run usage`).
