// npm run demo-shape: the shape of the real map in numbers, for the static
// demo's made-up crowd (src/demo/generate.ts) to be tuned to. Reads the
// archive's facts (MapFacts) and score report from the archive's server
// (the backend, at FRIEND_MAP_ARCHIVE_URL; archiveClient.ts) and writes
// src/demo/mapShape.ts: counts and distributions only (DemoShape in
// src/demo/shape.ts). Never a name, an alias, a title, a handle, an id or a
// message, so the file is checked in.
//
//   npm run demo-shape                 writes src/demo/mapShape.ts
//   npm run demo-shape -- --print      prints the JSON instead
//
// The archive gives the facts, and the shape is worked out here, closeness
// scored with friend-map's own scoring (at the default settings, with the
// hangouts and calls, as the map scores it), so it stays in friend-map with
// the demo it tunes.

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MapFacts, ScoreReport } from "../src/archive.ts";
import { closenessNow } from "../src/demos/closeness.ts";
import { histogram, type DemoShape } from "../src/demo/shape.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { dayStart, monthKey, monthRange } from "../src/time.ts";
import { refusal, takeContract } from "../src/contract/handshake.ts";
import { httpArchiveClient, type ArchiveClient } from "./archiveClient.ts";
import { archiveUrl, dataHome } from "./dataHome.ts";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

// The bars. Counts span orders of magnitude, so their edges do too.
const COUNT_EDGES = [0, 1, 3, 6, 11, 21, 51, 101, 201, 501, 1001, 2001, 5001, 10001, 20001, 50001];
const SHARE_EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const DAYS_EDGES = [0, 8, 31, 91, 366, 731, 1827];
const YEARS_EDGES = [0, 1, 2, 5, 10];
/** The first bar is no closeness at all (Orbits' belt): anything above it has some, however little. */
const SCORE_EDGES = [0, Number.MIN_VALUE, 1e-9, 0.01, 0.1, 1, 3, 10, 30, 100, 300, 1000];
const SIZE_EDGES = [2, 4, 7, 13, 31, 101, 301, 1001];
const SHOWN_EDGES = [0, 1, 2, 4, 7, 13, 31, 101];
const FEW_EDGES = [0, 1, 2, 4, 7, 13];
const MINUTES_EDGES = [0, 1, 3, 10, 30, 60, 120];
const HANGOUT_SIZE_EDGES = [1, 2, 3, 5, 9];
const HOURS_EDGES = [0, 1, 2, 3, 4, 6, 9];
const TAGS_EDGES = [0, 1, 2, 3, 4, 6];
const PER_TAG_EDGES = [0, 1, 2, 6, 11, 26, 51];

/** The shape of the map the archive's `facts` and score `report` give, as of `now`. */
export function shapeOf(facts: MapFacts, report: ScoreReport, now = Date.now()): DemoShape {
  const people = facts.people;
  const platformPeople = new Map<string, number>();
  for (const person of people) for (const platform of person.platforms) platformPeople.set(platform, (platformPeople.get(platform) ?? 0) + 1);
  const platforms: DemoShape["platforms"] = {};
  for (const [platform, messages] of Object.entries(facts.platformMessages)) platforms[platform] = { people: platformPeople.get(platform) ?? 0, messages };
  for (const [platform, count] of platformPeople) platforms[platform] ??= { people: count, messages: 0 };

  // Activity by month, UTC, every month from the first to the last.
  const byMonth = new Map(facts.months.map((row) => [row.month, row.count]));
  const activity = {
    from: facts.months[0]?.month ?? "",
    counts: facts.months.length > 0 ? monthRange(facts.months[0]!.month, facts.months.at(-1)!.month).map((month) => byMonth.get(month) ?? 0) : [],
  };

  // What the map's report gives of those it counts: when relationships started, closeness, reactions and openings.
  const scores = closenessNow({ ...report, generatedAt: now }, DEFAULT_SETTINGS);
  const counted = people.flatMap((person) => (person.report ? [{ id: person.id, ...person.report }] : []));
  const reactions = { fromMe: 0, fromThem: 0 };
  const openings = { byMe: 0, byThem: 0 };
  for (const person of counted) {
    reactions.fromMe += person.reactions.fromMe;
    reactions.fromThem += person.reactions.fromThem;
    openings.byMe += person.openings.byMe;
    openings.byThem += person.openings.byThem;
  }

  // Calls with the people shown: answered ones of known length, and those never answered.
  const answered = facts.calls.filter((call) => call.answered === true && call.durationSeconds !== null);
  let calls: DemoShape["calls"] = null;
  if (facts.calls.length > 0) {
    const perPerson = new Map<number, number>();
    for (const call of answered) perPerson.set(call.personId, (perPerson.get(call.personId) ?? 0) + 1);
    const callsByMonth = new Map<string, number>();
    for (const call of answered) callsByMonth.set(monthKey(call.at), (callsByMonth.get(monthKey(call.at)) ?? 0) + 1);
    const callMonths = [...callsByMonth.keys()].sort();
    calls = {
      answered: answered.length,
      missed: facts.calls.filter((call) => call.answered === false).length,
      people: perPerson.size,
      perPerson: histogram(perPerson.values(), COUNT_EDGES.slice(1)),
      minutes: histogram(answered.map((call) => call.durationSeconds! / 60), MINUTES_EDGES),
      activity: {
        from: callMonths[0] ?? "",
        counts: callMonths.length > 0 ? monthRange(callMonths[0]!, callMonths.at(-1)!).map((month) => callsByMonth.get(month) ?? 0) : [],
      },
    };
  }
  const catchUps = report.catchUps;
  const hangouts: DemoShape["hangouts"] = catchUps.length === 0 ? null : {
    count: catchUps.length,
    days: Math.round((now - dayStart(catchUps.map((c) => c.day).sort()[0]!)) / DAY),
    sizes: histogram(catchUps.map((c) => c.personIds.length), HANGOUT_SIZE_EDGES),
    // The demo's hangouts are each on one day, so a trip's days of hours are left out of how long they last.
    hours: histogram(catchUps.filter((c) => c.trip === null).map((c) => c.hours), HOURS_EDGES),
    withOthers: catchUps.filter((c) => c.others > 0).length,
  };

  const direct = people.filter((person) => person.youDirect + person.theyDirect > 0);
  const { groups, groupMessages } = facts;
  return {
    takenAt: new Date(now).toISOString().slice(0, 7),
    people: { shown: people.length, archivedByHand: facts.archived.byHand, archivedByRule: facts.archived.byRule, reachOut: people.filter((person) => person.reachOut).length },
    messagesPerPerson: histogram(people.map((person) => person.messages), COUNT_EDGES),
    myShare: histogram(direct.map((person) => person.youDirect / (person.youDirect + person.theyDirect)), SHARE_EDGES),
    lastSpoke: histogram(people.flatMap((person) => (person.lastMessageAt === null ? [] : [Math.max(0, (now - person.lastMessageAt) / DAY)])), DAYS_EDGES),
    firstSpoke: histogram(counted.flatMap((person) => (person.firstMessageAt === null ? [] : [Math.max(0, (now - person.firstMessageAt) / YEAR)])), YEARS_EDGES),
    closeness: histogram(counted.map((person) => scores.get(person.id) ?? 0), SCORE_EDGES),
    platforms,
    platformsPerPerson: histogram(people.map((person) => person.platforms.length), [1, 2, 3]),
    groups: {
      count: groups.length,
      titled: groups.filter((g) => g.titled).length,
      sizes: histogram(groups.map((g) => g.size), SIZE_EDGES),
      shown: histogram(groups.map((g) => g.shown), SHOWN_EDGES),
      messages: histogram(groupMessages.map((g) => g.messages), COUNT_EDGES),
      myShare: histogram(groupMessages.map((g) => g.mine / g.messages), SHARE_EDGES),
      lastSpoke: histogram(groupMessages.map((g) => Math.max(0, (now - g.last) / DAY)), DAYS_EDGES),
      years: histogram(groupMessages.map((g) => (g.last - g.first) / YEAR), YEARS_EDGES),
      perPerson: histogram(people.map((person) => person.groups), FEW_EDGES),
    },
    tags: {
      count: facts.tagPeople.length,
      peoplePerTag: histogram(facts.tagPeople, PER_TAG_EDGES),
      perPerson: histogram(people.map((person) => person.tags), TAGS_EDGES),
    },
    fields: { location: { people: people.filter((person) => person.located).length, values: facts.locations } },
    reactions,
    openings,
    activity,
    calls,
    hangouts,
  };
}

/** The shape of the map, as of `now`, from the archive's facts and score report read through `client`, in its time zone. */
export async function readShape(client: ArchiveClient, now = Date.now()): Promise<DemoShape> {
  const contract = await client.contract();
  if (refusal(contract) === null) takeContract(contract);
  const [facts, report] = await Promise.all([client.mapFacts(), client.scoreReport()]);
  return shapeOf(facts, report, now);
}

/** The shape as the TypeScript module the demo imports (src/demo/mapShape.ts). */
export function shapeModule(shape: DemoShape): string {
  return [
    "// The shape of the real map in numbers, written by `npm run demo-shape`",
    `// (server/demo-shape.ts) in ${shape.takenAt}: counts and distributions only,`,
    "// never a name, a title, a handle, an id or a message (DemoShape in shape.ts).",
    "// The static demo's made-up crowd (generate.ts) is tuned to it. Do not edit by hand.",
    "",
    'import type { DemoShape } from "./shape.ts";',
    "",
    `export const SHAPE: DemoShape = ${JSON.stringify(shape, null, 2)};`,
    "",
  ].join("\n");
}

const OUT = fileURLToPath(new URL("../src/demo/mapShape.ts", import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const shape = await readShape(httpArchiveClient(archiveUrl(), { folder: dataHome().archive }));
  if (process.argv.includes("--print")) console.log(JSON.stringify(shape, null, 2));
  else {
    await writeFile(OUT, shapeModule(shape));
    console.log(`Wrote ${OUT}: ${shape.people.shown} people shown, ${shape.groups.count} group chats, ${Object.keys(shape.platforms).length} platforms.`);
  }
}
