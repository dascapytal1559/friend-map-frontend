// contract-check: asks a backend (routes.ts) every read route of every capability its handshake declares, and holds
// each answer to its shape (schema.ts), so whoever writes a backend learns what it gets wrong, route by route, before
// friend-map draws a thing. It only reads: it never sends a write. What it reports names routes, fields and types,
// never a value from an answer (a name, a message), so its output can be shared.
//
// The ids a route needs (a person, a group chat, a chat, a day) are taken from the answers before it: someone from
// GET /people with messages, their group chats and chats, the day and month of their last message. A route whose ids
// no answer gave (no logged call, no change yet) is passed over, and says so.

import { ALSO_READS, ROUTES, type Capability, type Contract, type ListedCall, type PeopleListing, type Route, type PersonCall, type PersonGroup, type RelationshipsReport, type TimelinePage } from "../archive.ts";
import { KNOWN_CAPABILITIES, preContract, refusal } from "./handshake.ts";
import type { Backend } from "./routes.ts";
import { ANSWERS, peopleListing, relationshipsReport } from "./schema.ts";
import { problemsOf, type Problem } from "./shape.ts";

/** One route asked, and how its answer was. */
export interface RouteCheck {
  method: string;
  /** As ROUTES writes it: /people/:id. */
  route: string;
  capability: Capability;
  outcome: "ok" | "wrong" | "passed over";
  /** What is wrong ("wrong"), or why it was passed over. */
  problems: Problem[];
  why?: string;
}

export interface CheckReport {
  /** The handshake, as it answered, or preContract() for a backend with none. */
  contract: Contract;
  /** Why friend-map cannot use the backend at all (another major version, no `map`...); null when it can. */
  refused: string | null;
  /** It serves no handshake: friend-map uses it as one from before contract 1.0, but every backend must serve one. */
  noHandshake: boolean;
  /** Capabilities it declares that the contract does not have: passed over by the page, and here. */
  unknown: string[];
  checks: RouteCheck[];
  /** Nothing wrong anywhere. */
  ok: boolean;
}

/** The ids and dates the routes are asked with, found as the answers come in. */
interface Found {
  person?: number;
  account?: number;
  missingPerson?: number;
  group?: number;
  conversation?: number;
  day?: string;
  month?: string;
  loggedCall?: number;
  change?: number;
  attachment?: number;
}

/**
 * Asks `backend` everything its handshake says it serves, and how each answer is; `record`, given, is handed each
 * answer that fits, with the path it was asked at (npm run contract-examples writes them down).
 */
export async function checkBackend(backend: Backend, { record }: { record?: (route: string, path: string, body: unknown) => void } = {}): Promise<CheckReport> {
  const checks: RouteCheck[] = [];
  const handshake = await backend("GET", "/contract");
  let contract: Contract;
  let refused: string | null;
  const noHandshake = handshake.status === 404;
  if (noHandshake) {
    contract = preContract();
    refused = null;
    checks.push({ method: "GET", route: "/contract", capability: "map", outcome: "wrong", problems: [{ path: "(the answer)", problem: "is 404: every backend must serve GET /contract" }] });
  } else {
    refused = handshake.status === 200 ? refusal(handshake.body) : `GET /contract answers ${handshake.status}`;
    const problems = handshake.status === 200 ? problemsOf(ANSWERS.Contract, handshake.body) : [{ path: "(the answer)", problem: `is ${handshake.status}, not 200` }];
    checks.push({ method: "GET", route: "/contract", capability: "map", outcome: refused === null ? "ok" : "wrong", problems: refused === null || problems.length > 0 ? problems : [{ path: "(the answer)", problem: refused }] });
    contract = refused === null ? (handshake.body as Contract) : preContract();
    if (refused === null) record?.("/contract", "/contract", handshake.body);
  }
  const declared = new Set(contract.capabilities);
  const unknown = contract.capabilities.filter((c) => !(KNOWN_CAPABILITIES as string[]).includes(c));
  const found: Found = {};
  // Days and months as the backend counts them: in its time zone.
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: refused === null ? contract.timeZone : undefined, year: "numeric", month: "2-digit", day: "2-digit" });
  const when = (ms: number) => {
    const day = dayFormat.format(ms);
    return [day, day.slice(0, 7)] as const;
  };

  /** Asks `path` (ROUTES' `route` with its parts filled in) and holds the answer to `answer`'s shape; the answer when it fits. */
  async function ask<T>(capability: Capability, route: string, path: string, answer: string): Promise<T | undefined> {
    const got = await backend("GET", path);
    const problems: Problem[] = got.status === 200 ? shapeProblems(answer, got) : [{ path: "(the answer)", problem: `is ${got.status}, not 200` }];
    checks.push({ method: "GET", route, capability, outcome: problems.length === 0 ? "ok" : "wrong", problems });
    if (problems.length === 0) record?.(route, path, got.body);
    return problems.length === 0 ? (got.body as T) : undefined;
  }
  const passOver = (capability: Capability, route: string, why: string) => checks.push({ method: "GET", route, capability, outcome: "passed over", problems: [], why });

  // `map` first, as every other route is asked with what it names.
  const listing = await ask<PeopleListing>("map", "/people", "/people", "PeopleListing");
  const people = listing ? peopleListing.fill(listing).people : [];
  const someone = people.find((p) => p.directMessageCount > 0) ?? people.find((p) => p.messageCount > 0) ?? people[0];
  if (someone) {
    found.person = someone.id;
    found.account = someone.accounts[0]?.id;
    if (someone.lastMessageAt !== null) [found.day, found.month] = when(someone.lastMessageAt);
    found.missingPerson = Math.max(...people.map((p) => p.id)) + 1_000_000;
  }
  const report = await ask<RelationshipsReport>("map", "/relationships", "/relationships", "RelationshipsReport");
  if (report) found.group = relationshipsReport.fill(report).groups[0]?.id;
  if (found.person === undefined) passOver("map", "/people/:id", "GET /people lists nobody");
  else {
    await ask("map", "/people/:id", `/people/${found.person}`, "PersonSummary");
    const missing = await backend("GET", `/people/${found.missingPerson}`);
    checks.push({
      method: "GET", route: "/people/:id (someone not there)", capability: "map", outcome: missing.status === 404 ? "ok" : "wrong",
      problems: missing.status === 404 ? [] : [{ path: "(the answer)", problem: `is ${missing.status}: someone not there must be 404` }],
    });
  }

  // Then every other capability's reads, in ROUTES' order, those that find ids before those that need them.
  const reads = (capability: Capability) => [
    ...ROUTES.filter((r) => r.capability === capability && r.method === "GET"),
    ...(ALSO_READS[capability] ?? []).map((path) => ROUTES.find((r) => r.path === path && r.method === "GET")!),
  ];
  type Read = { capability: Capability; route: Route };
  const later: Read[] = [];
  for (const capability of KNOWN_CAPABILITIES) {
    if (capability === "map" || !declared.has(capability)) continue;
    for (const route of reads(capability)) {
      if ((route.needs ?? []).every((need) => declared.has(need))) await read(capability, route, later);
    }
  }
  // A route whose ids an answer after it named (a logged call in the Table's calls) is asked once more.
  for (const { capability, route } of later) await read(capability, route, null);

  /** Asks one read route and holds its answer to its shape; one whose ids are not known yet goes on `later`, or is passed over. */
  async function read(capability: Capability, route: Route, later: Read[] | null): Promise<void> {
    const path = await fill(route.path, capability);
    if (typeof path !== "string") {
      if (later) later.push({ capability, route });
      else passOver(capability, route.path, path.why);
      return;
    }
    if (route.answer === "events" || route.answer === "file") {
      const got = await backend("GET", path);
      const wanted = route.answer === "events" ? "text/event-stream" : null;
      const problems: Problem[] = got.status !== 200 ? [{ path: "(the answer)", problem: `is ${got.status}, not 200` }]
        : wanted && !got.contentType?.startsWith(wanted) ? [{ path: "(the answer)", problem: `should be ${wanted}, not ${got.contentType ?? "no content type"}` }] : [];
      checks.push({ method: "GET", route: route.path, capability, outcome: problems.length === 0 ? "ok" : "wrong", problems });
      return;
    }
    const answer = await ask<unknown>(capability, route.path, path, route.answer);
    learn(route.path, answer);
  }

  /** `route` with its parts filled in from what has been found, with a query where it needs one; why not, when it cannot be. */
  async function fill(route: string, capability: Capability): Promise<string | { why: string }> {
    const parts: Record<string, number | string | undefined> = {
      ":id": route.startsWith("/groups") ? found.group : route.startsWith("/content/conversations") ? found.conversation
        : route.startsWith("/calls") ? found.loggedCall : route.startsWith("/changes") ? found.change : route.startsWith("/content/attachments") ? found.attachment : found.person,
      ":month": found.month,
      ":day": found.day,
    };
    let path = route;
    for (const [part, value] of Object.entries(parts)) {
      if (!path.includes(part)) continue;
      if (value === undefined) return { why: `no answer before it named one to ask for (${part.slice(1)})` };
      path = path.replace(part, encodeURIComponent(String(value)));
    }
    if (capability === "content" && route.endsWith("/timeline")) return `${path}?limit=20`;
    if (route.endsWith("/messages") || route === "/changes") return `${path}?limit=20`;
    if (route === "/query") return `${path}?q=`;
    return path;
  }

  /** What an answer names that later routes are asked with. */
  function learn(route: string, answer: unknown): void {
    if (answer === undefined) return;
    if (route === "/people/:id/groups") found.group ??= (answer as PersonGroup[])[0]?.id;
    if (route === "/people/:id/calls") found.loggedCall ??= (answer as PersonCall[]).find((c) => c.manual)?.id;
    if (route === "/changes") found.change ??= (answer as Array<{ id: number }>)[0]?.id;
    if (route === "/calls") found.loggedCall ??= (answer as ListedCall[]).find((c) => c.ref.kind === "logged")?.ref.id;
    if (route === "/content/people/:id/timeline") {
      const messages = (answer as TimelinePage).messages;
      found.conversation ??= messages[0]?.conversation.id;
      found.attachment ??= messages.flatMap((m) => m.attachments).find((a) => !a.missing)?.id;
      if (messages[0]) [found.day, found.month] = when(messages[0].sentAt);
    }
  }

  return { contract, refused, noHandshake, unknown, checks, ok: refused === null && checks.every((c) => c.outcome !== "wrong") };
}

/** What is wrong with an answer as `answer` (a name in ROUTES), and that it is JSON. */
function shapeProblems(answer: string, got: { body: unknown; contentType: string | null }): Problem[] {
  if (!got.contentType?.startsWith("application/json")) return [{ path: "(the answer)", problem: `should be JSON, not ${got.contentType ?? "no content type"}` }];
  const shape = ANSWERS[answer];
  return shape ? problemsOf(shape, got.body) : [{ path: "(the answer)", problem: `has no shape named ${answer} to check (a mistake in friend-map)` }];
}

/** A report in lines, for a terminal: each route's outcome, each problem once per field however many items have it. */
export function reportLines(report: CheckReport, { where }: { where: string }): string[] {
  const lines = [`contract-check of ${where}: contract ${report.contract.version}, ${report.contract.capabilities.length} capabilities (${report.contract.capabilities.join(", ")})`];
  if (report.unknown.length > 0) lines.push(`  It declares capabilities the contract does not have, which friend-map passes over: ${report.unknown.join(", ")}`);
  for (const check of report.checks) {
    const mark = check.outcome === "ok" ? "ok  " : check.outcome === "wrong" ? "FAIL" : "--  ";
    lines.push(`${mark} ${check.method} ${check.route} [${check.capability}]${check.why ? `: passed over, ${check.why}` : ""}`);
    for (const [problem, count] of grouped(check.problems)) lines.push(`       ${problem}${count > 1 ? ` (${count} places)` : ""}`);
  }
  const wrong = report.checks.filter((c) => c.outcome === "wrong").length;
  lines.push(report.refused ? `friend-map cannot use this backend: ${report.refused}.` : "");
  if (report.noHandshake) lines.push("It serves no handshake: friend-map takes it to be a backend from before contract 1.0 and to serve everything (the capabilities above), in friend-map's own time zone.");
  lines.push(report.ok ? `Every route fits contract ${report.contract.version}.` : `${wrong} of ${report.checks.length} routes do not fit the contract.`);
  return lines.filter((line, i) => line !== "" || i === 0);
}

/** Problems with their items' places left out (people[*].name), each once, with how many there were; at most 12. */
function grouped(problems: readonly Problem[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const p of problems) {
    const key = `${p.path.replace(/\[\d+\]/g, "[*]")} ${p.problem}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = [...counts];
  return all.length > 12 ? [...all.slice(0, 12), [`...and ${all.length - 12} more`, 1]] : all;
}
