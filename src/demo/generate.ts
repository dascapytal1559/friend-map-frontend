// The demo's made-up crowd, the real map at about half its size
// (DEMO_SIZE people on the map) and everything else in proportion: the
// user talking with them over the years on the same platforms, as many
// group chats of the same sizes and busyness, calls and hangouts, and as many
// people the archive rules archive (people met only in big group chats,
// deleted accounts, Marketplace sellers, one-sided chats), all invented, and shaped by the numbers taken from the real map
// (mapShape.ts, see shape.ts): how many messages people have, who writes
// more, when they were last and first spoken to, which platforms they are on,
// how big and busy group chats are, who is tagged, where they are, who to
// reach out to, how many calls and hangouts there were, and how the messages
// spread over the years. Seeded, so the same `now` always makes the same
// crowd, and made in the page as it opens, so nothing made up is stored
// anywhere.
//
// Its 700,000 messages are kept as columns (DemoMessages), not as objects, and
// none of them keeps its line of chat: messageText picks it, when a chat is
// shown, from a modest pool of made-up lines (words.ts) by where the message
// is, so the same message always reads the same.
//
// Every name, tag, place, title and line of chat comes from words.ts,
// invented for the demo, and generate.test.ts holds them against
// your archive where there is one. The demo's archive (archive.ts) serves
// what is made here as the server serves the real archive.

import { ARCHIVE_TAG, KEEP_TAG, LIVE_TOGETHER_TAG, type ScoredCatchUp } from "../archive.ts";
import { dayKey, dayStart, monthKey, monthRange } from "../time.ts";
import { shortened } from "../names.ts";
import { SMALL_GROUP_MAX } from "./rules.ts";
import { SHAPE } from "./mapShape.ts";
import { draw, type Histogram } from "./shape.ts";
import {
  BIG_GROUPS, CATCH_UP_NOTES, COMMERCIAL_TAG, EMOJI, FILLS, FIRST_NAMES, GROUP_TITLES, GROUPS, LAST_NAMES, LINES, LOCATION_VALUES,
  MARKETPLACE_ITEMS, nicknameOf, NOTES, PLACES, SELF_NAME, TAGS, type GroupKind,
} from "./words.ts";

const SEED = 20260401;
/**
 * People on the demo's map: about half the real map's, so the crowd is lighter to open and to look at. Everything is
 * drawn from the real map's shape all the same, each band of closeness keeping its share, so most of the half left out is
 * from the outer rings, where most people are.
 */
export const DEMO_SIZE = 400;
/** The most messages one person's one-to-one chats, or one group chat, hold: past the shape's busiest; a test's crowd may hold fewer. */
const MOST_MESSAGES = 80_000;
/** How many of the people on the map were spoken to in the last three weeks, whatever the shape's draw gives the rest. */
const RECENT = 5;
const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const MINUTE = 60_000;
/** A message this long after the one before it in its chat starts an exchange: it is an opener, not a reply. */
const QUIET = 90 * MINUTE;
/** Every tag, in the tag table's order. */
export const TAG_ORDER: readonly string[] = [...TAGS.map((t) => t.tag), ARCHIVE_TAG, KEEP_TAG, LIVE_TOGETHER_TAG, COMMERCIAL_TAG];
/** Which lines a tag's people talk in (words.ts LINES). */
const TOPIC_OF: Readonly<Record<string, string>> = {
  climbing: "climbing", uni: "uni", work: "work", family: "family", footy: "footy", "book-club": "books", neighbours: "neighbours",
  travel: "travel", music: "music", cooking: "food", school: "uni", running: "running", "old-work": "work", housemates: "home",
  exchange: "uni", choir: "music",
};

export interface DemoAccount {
  id: number;
  platform: string;
  displayName: string;
  handle: string | null;
  personId: number;
  isSelf: boolean;
}

export interface DemoPersonRecord {
  id: number;
  name: string;
  aliases: string[];
  tags: string[];
  note: string;
  location: string | null;
  shouldReachOut: boolean;
  /** Named, tagged or otherwise touched by you: the archive rules leave them be. */
  edited: boolean;
  isSelf: boolean;
}

export interface DemoConversation {
  id: number;
  platform: string;
  type: "direct" | "group";
  title: string | null;
  marketplace: boolean;
  /** Your account there included. */
  memberAccountIds: number[];
  /** What its lines of chat are about (a topic of words.ts LINES; "marketplace" and "request" chats have lines of their own). */
  topic: string;
  /** Where its messages are in the crowd's messages (DemoMessages): `count` of them from `start`, oldest first. */
  start: number;
  count: number;
}

/**
 * The crowd's messages as columns, one entry per message: each chat's together and oldest first (as its
 * conversation's start and count say). A message's id is its place here plus one. Its line of chat is not kept:
 * messageText works it out.
 */
export interface DemoMessages {
  length: number;
  /** The chat it is in. */
  conversation: Int32Array;
  /** The account that sent it. */
  sender: Int32Array;
  /** When, in whole milliseconds. */
  sentAt: Float64Array;
  /** The calls among them (call records, in one-to-one chats), by place: seconds connected, 0 for one never answered. */
  calls: Map<number, number>;
  /** Reactions, by place. */
  reactions: Map<number, Array<{ actorAccountId: number; emoji: string }>>;
}

/** A catch-up (src/catchUps.ts), as the archive keeps it: its note, everyone at it by id, and how many unnamed others. */
export type DemoCatchUp = ScoredCatchUp & { note: string; time: string | null };

export interface DemoData {
  now: number;
  selfPersonId: number;
  people: DemoPersonRecord[];
  accounts: DemoAccount[];
  /** By id, from 1. */
  conversations: DemoConversation[];
  messages: DemoMessages;
  /** The tag table, in order. */
  tags: string[];
  /** Oldest first, ids in that order. */
  catchUps: DemoCatchUp[];
}

export interface DemoOptions {
  /**
   * People on the map: DEMO_SIZE unless a test wants a smaller crowd. Everything else (group chats, calls, hangouts,
   * archived people) is the shape's count in the same proportion to the real map's (the shape's people shown).
   */
  size?: number;
  /** The most messages one person's one-to-one chats, or one group chat, hold (MOST_MESSAGES unless a test wants fewer). */
  most?: number;
  seed?: number;
}

/** A crowd small enough for a test to import into a real archive, with everything the full one has. */
export const SMALL_CROWD: DemoOptions = { size: 80, most: 1200 };

/** The crowd as of `now`: the same every time for the same `now` and options. */
export function generateDemo(now = Date.now(), { size = DEMO_SIZE, most = MOST_MESSAGES, seed = SEED }: DemoOptions = {}): DemoData {
  const random = mulberry32(seed);
  const scale = size / SHAPE.people.shown;
  const scaled = (n: number) => Math.round(n * scale);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const weighted = <T>(list: readonly T[], weight: (item: T) => number): T => {
    let u = random() * list.reduce((sum, item) => sum + weight(item), 0);
    for (const item of list) if ((u -= weight(item)) < 0) return item;
    return list[list.length - 1];
  };
  const chance = (p: number) => random() < p;
  const shape = (bars: Histogram | null, fallback: Histogram, options?: Parameters<typeof draw>[2]) => draw(bars ?? fallback, random, options);
  const latest = now - MINUTE;
  const calendar = monthsOf(now);

  const people: DemoPersonRecord[] = [];
  const accounts: DemoAccount[] = [];
  const conversations: DemoConversation[] = [];
  const messages = new MessageColumns();

  // The platforms you chat on, and you, with an account on every one.
  const platforms = Object.entries(SHAPE.platforms).filter(([, p]) => p.people > 0 && p.messages > 0).map(([platform]) => platform);
  const peopleOn = (platform: string) => SHAPE.platforms[platform]?.people ?? 1;
  const groupsOn = (platform: string) => SHAPE.platforms[platform]?.messages ?? 1;
  // How much is said per person on each platform, against the mean: the busiest friendships are mostly on the busiest.
  const intensities = platforms.map((p) => groupsOn(p) / Math.max(1, peopleOn(p)));
  const meanIntensity = intensities.reduce((a, b) => a + b, 0) / Math.max(1, intensities.length);
  const intensity = (platform: string) => intensities[platforms.indexOf(platform)] / meanIntensity;
  const self: DemoPersonRecord = { id: 1, name: SELF_NAME, aliases: [], tags: [], note: "", location: null, shouldReachOut: false, edited: false, isSelf: true };
  people.push(self);
  const selfAccount = new Map<string, DemoAccount>();
  for (const platform of platforms) {
    const account = { id: accounts.length + 1, platform, displayName: SELF_NAME, handle: null, personId: self.id, isSelf: true };
    accounts.push(account);
    selfAccount.set(platform, account);
  }

  // Names: every first name with every last name, in an order of their own, so no two people share one; and every short
  // name ("Ada S.", as the demo shows names off the map and its map to start with: shortened in src/names.ts) once
  // before any twice, so the people on the map, named first, do not share one as shown either.
  const names = FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`)).filter((name) => name !== SELF_NAME);
  shuffleInPlace(names, random);
  const taken = new Map<string, number>();
  const round = new Map(names.map((name) => {
    const short = shortened(name, "initial");
    taken.set(short, (taken.get(short) ?? 0) + 1);
    return [name, taken.get(short)!];
  }));
  names.sort((a, b) => round.get(a)! - round.get(b)!);
  let named = 0;
  const newName = () => names[named++ % names.length];
  // The one Hide leaves off, made last (below), is on the map too: its name is set aside with theirs.
  const commercialName = newName();
  const addPerson = (over: Partial<DemoPersonRecord> = {}): DemoPersonRecord => {
    const person: DemoPersonRecord = {
      id: people.length + 1, name: over.name ?? newName(), aliases: [], tags: [], note: "", location: null, shouldReachOut: false,
      edited: false, isSelf: false, ...over,
    };
    people.push(person);
    return person;
  };
  const addAccount = (person: DemoPersonRecord, platform: string, displayName = person.name): DemoAccount => {
    const account = { id: accounts.length + 1, platform, displayName, handle: null, personId: person.id, isSelf: false };
    accounts.push(account);
    return account;
  };
  /** A chat, whose messages `fill` writes then and there, so each chat's messages are together. */
  const addConversation = (over: Omit<DemoConversation, "id" | "start" | "count">, fill: (chat: DemoConversation) => void): DemoConversation => {
    const conversation: DemoConversation = { id: conversations.length + 1, ...over, start: messages.length, count: 0 };
    conversations.push(conversation);
    fill(conversation);
    conversation.count = messages.length - conversation.start;
    return conversation;
  };
  /** A moment on a day: evenings mostly. */
  const timeOfDay = () => {
    const hour = Math.min(23, Math.max(7, Math.round(19 + gaussian(random) * 4)));
    return hour * 60 * MINUTE + Math.floor(random() * 60) * MINUTE;
  };
  const react = (index: number, actor: DemoAccount, p: number) => {
    if (chance(p)) messages.reactions.set(index, [{ actorAccountId: actor.id, emoji: pick(EMOJI) }]);
  };

  /**
   * `count` messages from `from` to `last` in one chat, in exchanges of a few messages on a few days close together,
   * in some months and not others (a month for about every `perMonth` messages, the first and last always, the last
   * weighing `trailing` of its share), each month's share by `weight` (of its start, as a fraction of the way
   * through), the busy years of the real map busier; `speak` gives each message's sender, from the one before it (null for the first of an exchange), and
   * `written` hears of each. Oldest first, the last at `last`, and `calls` (call records, oldest first) in their
   * places among them.
   */
  const exchanges = (
    chat: DemoConversation, count: number, from: number, last: number, weight: (t: number) => number, longest: number, perMonth: number, trailing: number,
    speak: (before: DemoAccount | null) => DemoAccount, written: (index: number, sender: DemoAccount) => void,
    calls: ReadonlyArray<{ at: number; sender: DemoAccount; seconds: number }> = [],
  ) => {
    const months = calendar.between(Math.max(calendar.first, from), last);
    const weights = months.map((m, i) => weight(months.length === 1 ? 1 : i / (months.length - 1)) * (0.5 + random()) * calendar.busy(m.index));
    // Talked in only some months: the rest weigh nothing. The last is a few words, as a friendship trails off.
    const active = Math.min(months.length, Math.max(2, Math.round(count / perMonth)));
    if (active < months.length) {
      const chosen = new Set([0, months.length - 1, ...sampleWithout(months.map((_, i) => i).slice(1, -1), (i) => weights[i], active - 2, random)]);
      for (let i = 0; i < weights.length; i++) if (!chosen.has(i)) weights[i] = 0;
    }
    if (months.length > 1) weights[months.length - 1] *= trailing;
    const inMonth = apportion(count, weights, [0, months.length - 1]);
    let previous = -Infinity;
    let call = 0;
    const callsUpTo = (at: number) => {
      while (call < calls.length && calls[call].at <= at) {
        const c = calls[call++];
        previous = Math.max(c.at, previous);
        messages.calls.set(messages.push(chat.id, c.sender.id, previous), c.seconds);
      }
    };
    const push = (at: number, sender: DemoAccount) => {
      callsUpTo(at);
      const index = messages.push(chat.id, sender.id, at);
      previous = at;
      written(index, sender);
    };
    for (const [i, month] of months.entries()) {
      let left = inMonth[i];
      if (left === 0) continue;
      const lengths: number[] = [];
      while (left > 0) {
        const length = Math.min(left, 1 + Math.floor(random() * longest));
        lengths.push(length);
        left -= length;
      }
      // A few days close together: a stretch of the month, longer the more there is to say.
      const span = Math.max(1, Math.floor((month.end - Math.max(month.start, from)) / DAY));
      const days = Math.min(span, 2 + lengths.length * 2);
      const start = Math.max(month.start, from) + Math.floor(random() * (span - days + 1)) * DAY;
      const starts = lengths.map(() => start + Math.floor(random() * days) * DAY + timeOfDay()).sort((a, b) => a - b);
      for (const [e, length] of lengths.entries()) {
        let at = Math.max(starts[e], previous);
        let sender: DemoAccount | null = null;
        for (let k = 0; k < length; k++) {
          if (k > 0) at += (0.5 + random() * 8) * MINUTE;
          sender = speak(k === 0 ? null : sender);
          push(Math.round(Math.min(at, last)), sender);
        }
      }
    }
    // The last message is at `last`, and any call after it comes after it.
    if (messages.length > chat.start) messages.sentAt[messages.length - 1] = previous = Math.max(previous, Math.round(last));
    callsUpTo(Infinity);
  };

  /** The rise and fall of a friendship: steady, rising, fading, a flare, or two. */
  const arcs: Array<(t: number) => number> = [
    () => 1,
    (t) => 0.2 + t,
    (t) => 1.2 - t,
    (t) => 0.15 + Math.exp(-((t - 0.5) ** 2) / 0.02),
    (t) => 0.15 + Math.exp(-((t - 0.25) ** 2) / 0.01) + Math.exp(-((t - 0.8) ** 2) / 0.01),
  ];
  /**
   * A one-to-one chat between you (`me`) and `them`, `count` messages from `from` to `last`, you
   * writing about `myShare` of them, along an arc; `calls` among them.
   */
  const directChat = (
    platform: string, me: DemoAccount, them: DemoAccount, topic: string, count: number, from: number, last: number, myShare: number,
    calls: ReadonlyArray<{ at: number; sender: DemoAccount; seconds: number }> = [],
  ) =>
    addConversation({ platform, type: "direct", title: them.displayName, marketplace: false, memberAccountIds: [me.id, them.id], topic }, (chat) => {
      const arc = pick(arcs);
      const toMe = Math.min(0.95, myShare + 0.25);
      const toThem = Math.max(0.05, myShare - 0.25);
      exchanges(
        chat, count, from, last, arc, 6, 30, 0.15,
        (before) => (before === null ? (chance(0.61) ? them : me) : chance(before === them ? toMe : toThem) ? me : them),
        (index, sender) => react(index, sender === me ? them : me, sender === me ? 0.035 : 0.011),
        calls,
      );
    });

  // The people on the map: first who they are and how much there is between them and you, then their chats.
  interface Shown {
    person: DemoPersonRecord;
    accounts: DemoAccount[];
    topic: string;
    circle: string;
    /** Their one-to-one messages, and all they are meant to have, with what they say in group chats. */
    count: number;
    total: number;
    first: number;
    last: number;
    lastDays: number;
    myShare: number;
    platforms: string[];
    calls: Array<{ at: number; sender: "me" | "them"; seconds: number }>;
  }
  const shown: Shown[] = [];
  const reachOut = new Set<number>();
  // All but one: the last is someone Hide leaves off to start with (below).
  for (let i = 0; i < size - 1; i++) {
    const person = addPerson();
    const tagCount = Math.floor(shape(SHAPE.tags.perPerson, [{ from: 0, to: 1, count: 2 }, { from: 1, to: 2, count: 1 }]));
    while (person.tags.length < Math.min(tagCount, 3)) {
      const tag = weighted(TAGS, (t) => t.weight).tag;
      if (!person.tags.includes(tag)) person.tags.push(tag);
    }
    if (chance(SHAPE.fields.location.people / SHAPE.people.shown)) person.location = weighted(LOCATION_VALUES, (v) => v.weight).value;
    if (chance(0.15)) person.aliases.push(nicknameOf(person.name.split(" ")[0]));
    if (chance(0.08)) person.note = pick(NOTES);
    // The first few are people spoken to in the last three weeks, so the map has a today and a yesterday whatever the draw.
    const lastDays = i < RECENT ? 0.3 + 20 * random() : shape(SHAPE.lastSpoke, [{ from: 0, to: 365, count: 1 }], { open: 2.5 });
    // What they said in group chats is counted with this too, so their one-to-one chats hold a little less.
    const total = Math.round(shape(SHAPE.messagesPerPerson, [{ from: 1, to: 100, count: 1 }], { log: true, open: 1.5 }));
    const count = Math.min(most, Math.round(total * 0.8));
    const platformCount = Math.floor(shape(SHAPE.platformsPerPerson, [{ from: 1, to: 2, count: 1 }]));
    const theirs: string[] = [];
    while (theirs.length < Math.min(platformCount, 3, platforms.length)) {
      const platform = weighted(platforms, (p) => peopleOn(p) * (count >= 300 ? Math.sqrt(intensity(p)) : 1));
      if (!theirs.includes(platform)) theirs.push(platform);
    }
    const last = Math.min(latest, now - lastDays * DAY);
    let first = now - shape(SHAPE.firstSpoke, [{ from: 0, to: 5, count: 1 }], { open: 1.7 }) * YEAR;
    if (first > last - 7 * DAY) first = last - (7 + 1000 * random() ** 2) * DAY;
    // A friendship of thousands of messages took a while: a day for every fifteen of them, at least.
    first = Math.max(Math.min(first, last - (count / 15) * DAY), calendar.first);
    const myShare = Math.min(0.9, Math.max(0.1, shape(SHAPE.myShare, [{ from: 0.4, to: 0.6, count: 1 }])));
    const circle = person.tags[0] ?? weighted(TAGS, (t) => t.weight).tag;
    shown.push({ person, accounts: theirs.map((platform) => addAccount(person, platform)), topic: TOPIC_OF[person.tags[0] ?? ""] ?? "general", circle, count, total, first, last, lastDays, myShare, platforms: theirs, calls: [] });
    person.edited = person.tags.length > 0 || person.aliases.length > 0 || person.note !== "" || person.location !== null || theirs.length > 1;
    // Someone with a message or none is on the map only because you tagged them.
    if (count < 2 && !person.edited) {
      person.tags.push(weighted(TAGS, (t) => t.weight).tag);
      person.edited = true;
    }
  }
  // As many to reach out to as on the real map, among those not spoken to lately, so Orbits has its glows.
  for (const s of shuffle(shown.filter((s) => s.lastDays > 30), random).slice(0, Math.max(1, scaled(SHAPE.people.reachOut)))) {
    s.person.shouldReachOut = true;
    reachOut.add(s.person.id);
  }

  // Calls: with as many people as on the real map, the closest most likely, as often and as long, and when.
  if (SHAPE.calls) {
    const calls = SHAPE.calls;
    const callers = sampleWithout(shown.filter((s) => s.count > 0), (s) => Math.sqrt(s.count) * Math.exp(-s.lastDays / 365), Math.max(1, scaled(calls.people)), random);
    const callMonths = calendar.between(dayStart(`${calls.activity.from}-01`), now);
    const missedEach = calls.missed / Math.max(1, calls.answered);
    for (const s of callers) {
      const answered = Math.max(1, Math.floor(draw(calls.perPerson, random, { log: true })));
      const missed = Math.round(answered * missedEach * (0.5 + random()));
      // Within their chat's span, in the months you called most.
      const months = callMonths
        .map((m, i) => ({ start: Math.max(m.start, s.first), end: Math.min(m.end, s.last), weight: (calls.activity.counts[i] ?? 0) + 0.2 }))
        .filter((m) => m.end > m.start);
      const when = () => {
        if (months.length === 0) return s.first + (s.last - s.first) * random();
        const m = weighted(months, (x) => x.weight);
        return m.start + (m.end - m.start) * random();
      };
      for (let k = 0; k < answered + missed; k++) {
        const seconds = k < answered ? Math.max(1, Math.round(draw(calls.minutes, random, { open: 2 }) * 60)) : 0;
        s.calls.push({ at: Math.round(Math.min(when(), latest)), sender: chance(0.5) ? "me" : "them", seconds });
      }
      s.calls.sort((a, b) => a.at - b.at);
    }
  }

  // Their one-to-one chats: one per platform, the later platform taking over from the earlier at some point, each call
  // in whichever chat was then.
  for (const s of shown) {
    if (s.count === 0) continue;
    // Each platform's stretch of it, the busier platforms taking more.
    const shares = s.platforms.map((p) => intensity(p) * (0.5 + random()));
    const sum = shares.reduce((a, b) => a + b, 0);
    const cuts = shares.map((_, k) => shares.slice(0, k).reduce((a, b) => a + b, 0) / sum);
    const before = messages.length;
    const spans = s.accounts.flatMap((account, k) => {
      const share = Math.round(s.count * ((cuts[k + 1] ?? 1) - cuts[k]));
      if (share === 0 && k > 0) return [];
      const from = s.first + (s.last - s.first) * cuts[k];
      const last = k === s.accounts.length - 1 ? s.last : s.first + (s.last - s.first) * cuts[k + 1] - DAY;
      return [{ account, share: Math.max(1, share), from, last, calls: [] as Shown["calls"] }];
    });
    for (const c of s.calls) spans.findLast((span, k) => k === 0 || span.from <= c.at)!.calls.push(c);
    for (const { account, share, from, last, calls } of spans) {
      const me = selfAccount.get(account.platform)!;
      directChat(account.platform, me, account, s.topic, share, from, last, s.myShare, calls.map((c) => ({ at: c.at, sender: c.sender === "me" ? me : account, seconds: c.seconds })));
    }
    // Both wrote, so the rules keep them on the map.
    const mine = new Set(s.accounts.map((a) => a.id));
    let theirs = 0;
    let ours = 0;
    for (let i = before; i < messages.length; i++) {
      if (messages.calls.has(i)) continue;
      if (mine.has(messages.sender[i])) theirs++;
      else ours++;
    }
    if (s.count >= 2 && (theirs === 0 || ours === 0)) {
      let flip = messages.length - 1;
      while (messages.calls.has(flip)) flip--;
      const [me, them] = conversations[messages.conversation[flip] - 1].memberAccountIds;
      messages.sender[flip] = theirs === 0 ? them : me;
    }
  }

  // The archived people who fill group chats beside the people on the map: as many of each kind as the real map
  // has, made as places need them. People met only in big group chats (most never wrote there; some did), accounts
  // with no name (an address), archived by hand, and deleted accounts.
  const targets = SHAPE.people.archivedByRule;
  const quiet = { left: scaled(targets["groups-silent"] ?? 0), made: new Map<string, DemoAccount[]>() };
  const wrote = { left: scaled(targets["groups-wrote"] ?? 0), made: new Map<string, DemoAccount[]>(), accounts: [] as DemoAccount[] };
  const unnamed = { left: scaled(targets["no-name"] ?? 0), made: new Map<string, DemoAccount[]>() };
  const byHand = { left: scaled(SHAPE.people.archivedByHand), made: new Map<string, DemoAccount[]>() };
  // An address at one of the domains kept for examples, never anyone's: each one different.
  let addresses = 0;
  const unnamedAddress = () => `${pick(FIRST_NAMES).toLowerCase()}.${pick(["kettle", "lantern", "pebble", "comet", "maple", "otter", "quill"])}${10 + addresses++}@example.${pick(["org", "net", "com"])}`;
  const made = (kind: { made: Map<string, DemoAccount[]> }, platform: string, account: DemoAccount) => {
    (kind.made.get(platform) ?? kind.made.set(platform, []).get(platform)!).push(account);
    return account;
  };
  /**
   * Someone to fill a place in a group chat on `platform`: `safe` when you write in a small one (the rules
   * keep anyone in such a group who is not archived for another reason); `writers` is whether there are messages enough
   * for one more of them to write there. Once there are as many of each kind as the real map has, someone already
   * made is in another group too; null when there is nobody left to be.
   */
  const filler = (platform: string, safe: boolean, taken: Set<number>, writers: boolean): { account: DemoAccount; talks: number } | null => {
    const reuse = (pool: Map<string, DemoAccount[]>) => {
      const list = pool.get(platform) ?? [];
      for (let tries = 0; tries < 12 && list.length > 0; tries++) {
        const account = list[Math.floor(random() * list.length)];
        if (!taken.has(account.id)) return account;
      }
      return null;
    };
    if (safe) {
      if (chance(0.5) && byHand.left > 0) {
        byHand.left--;
        return { account: made(byHand, platform, addAccount(addPerson({ tags: [ARCHIVE_TAG], edited: true }), platform)), talks: 0.3 };
      }
      if (unnamed.left > 0) {
        unnamed.left--;
        const person = addPerson({ name: unnamedAddress() });
        return { account: made(unnamed, platform, addAccount(person, platform)), talks: 0.1 };
      }
      const again = reuse(byHand.made) ?? reuse(unnamed.made);
      return again ? { account: again, talks: 0.1 } : null;
    }
    const kinds = [{ kind: quiet, w: quiet.left }, { kind: wrote, w: writers ? wrote.left * 2 : 0 }, { kind: unnamed, w: unnamed.left * 0.5 }];
    const open = kinds.reduce((n, k) => n + k.w, 0);
    if (open > 0) {
      const { kind } = weighted(kinds, (k) => k.w);
      kind.left--;
      const person = addPerson(kind === unnamed ? { name: unnamedAddress() } : {});
      const account = made(kind, platform, addAccount(person, platform));
      if (kind === wrote) wrote.accounts.push(account);
      return { account, talks: kind === wrote ? 0.05 + random() ** 2 : kind === unnamed ? 0.02 : 0 };
    }
    const again = reuse(quiet.made) ?? reuse(wrote.made);
    return again ? { account: again, talks: wrote.made.get(platform)?.includes(again) ? 0.05 + random() ** 2 : 0 } : null;
  };

  /**
   * Someone on the map's account on a platform, made for them when they have none there: one account per platform. A
   * person with accounts on several platforms is counted as your doing (you named or linked them), so edited.
   */
  const accountOn = (s: Shown, platform: string): DemoAccount => {
    let account = s.accounts.find((a) => a.platform === platform);
    if (!account) {
      s.accounts.push((account = addAccount(s.person, platform)));
      s.person.edited = true;
    }
    return account;
  };

  // Group chats: as many as the real map's, as big, with as many people from the map in each, each person on the map in
  // as many as the shape says, mostly with people of their own circle (their first tag).
  const quota = new Map(shown.map((s) => [s.person.id, s.total < 3 ? 0 : Math.floor(shape(SHAPE.groups.perPerson, [{ from: 0, to: 2, count: 1 }]))]));
  const circles = [...new Set(shown.map((s) => s.circle))];
  const usedTitles = new Set<string>();
  const newTitle = (big: boolean) => {
    for (;;) {
      const { start, topic } = pick(GROUP_TITLES.starts);
      const title = `${pick(PLACES)} ${start.toLowerCase()} ${pick(big ? GROUP_TITLES.big : GROUP_TITLES.small)}`;
      if (!usedTitles.has(title)) return usedTitles.add(title), { title, topic };
    }
  };
  const groupCount = Math.max(GROUPS.length + BIG_GROUPS.length, scaled(SHAPE.groups.count));
  const untitled = 1 - SHAPE.groups.titled / Math.max(1, SHAPE.groups.count);
  // Sizes and how many messages, drawn apart and then paired loosely by rank: a bigger group is mostly a busier one.
  const sizes = Array.from({ length: groupCount }, () => Math.max(2, Math.floor(shape(SHAPE.groups.sizes, [{ from: 3, to: 9, count: 1 }], { log: true, open: 2 }))));
  const busiest = Array.from({ length: groupCount }, () => Math.max(1, Math.round(shape(SHAPE.groups.messages, [{ from: 20, to: 500, count: 1 }], { log: true, open: 2 })))).sort((a, b) => a - b);
  const counts = new Array<number>(groupCount);
  sizes
    .map((size, g) => ({ g, key: Math.log(size) + gaussian(random) * 0.8 }))
    .sort((a, b) => a.key - b.key)
    .forEach(({ g }, rank) => (counts[g] = busiest[rank]));
  const groupsOf = new Map<number, number>();
  const groupMembers: Array<{ chat: DemoConversation; accounts: Set<number> }> = [];
  for (let g = 0; g < groupCount; g++) {
    const kind: GroupKind | undefined = GROUPS[g] ?? BIG_GROUPS[g - GROUPS.length];
    const size = kind ? Math.max(3, kind.size + Math.round(gaussian(random) * 1.5) - 1) : sizes[g];
    const big = kind ? BIG_GROUPS.includes(kind) : size > 30;
    const fromMap = kind ? (big ? 3 : size - 1) : Math.min(size - 1, Math.floor(shape(SHAPE.groups.shown, [{ from: 1, to: 4, count: 1 }])));
    const lastDays = Math.max(0.2, shape(SHAPE.groups.lastSpoke, [{ from: 0, to: 365, count: 1 }], { open: 2 }));
    const last = Math.min(latest, now - lastDays * DAY);
    const from = Math.max(calendar.first, last - Math.max(3 * DAY, shape(SHAPE.groups.years, [{ from: 0, to: 2, count: 1 }], { open: 1.5 }) * YEAR));
    // Who from the map: those with places left in their quota, mostly of one circle (the kind's tags, for the named
    // kinds), and talking with you around then.
    const circle = kind && kind.from.length > 0 ? kind.from : [pick(circles)];
    const chosen = sampleWithout(shown, (s) => {
      const left = quota.get(s.person.id)!;
      const near = s.person.tags.some((t) => circle.includes(t)) || circle.includes(s.circle);
      const then = s.first - YEAR < last && s.last + YEAR > from;
      return (left > 0 ? left : 0.02) * (near ? 8 : 1) * (then ? 1 : 0.03);
    }, fromMap, random);
    // On a platform most of them are on, the busier platforms more likely, or, with nobody from the map, wherever
    // group chats are busiest.
    const on = new Map<string, number>();
    for (const p of chosen.flatMap((s) => s.platforms)) on.set(p, (on.get(p) ?? 0) + 1);
    const platform = on.size > 0 ? weighted([...on], ([p, n]) => n ** 3 * intensity(p) ** 0.25)[0] : weighted(platforms, groupsOn);
    for (const s of chosen) {
      quota.set(s.person.id, quota.get(s.person.id)! - 1);
      groupsOf.set(s.person.id, (groupsOf.get(s.person.id) ?? 0) + 1);
    }
    const count = Math.min(most, counts[g]);
    // Your share; where you write in a small one, its other places go to people archived for another reason.
    let myShare = Math.min(1, shape(SHAPE.groups.myShare, [{ from: 0.1, to: 0.3, count: 1 }]));
    if (myShare < 0.1) myShare = chance(0.6) ? 0 : myShare;
    const safe = size <= SMALL_GROUP_MAX && myShare > 0;
    const members: Array<{ account: DemoAccount; talks: number }> = chosen.map((s) => ({ account: accountOn(s, platform), talks: random() ** 2 + 0.02 }));
    const taken = new Set(members.map((m) => m.account.id));
    // Those met only here who write here, no more than the others' messages leave room for.
    let writers = Math.floor((count * (1 - myShare)) / 3);
    while (members.length < size - 1) {
      const fill = filler(platform, safe, taken, writers > 0);
      if (!fill) break;
      if (fill.talks > 0) writers--;
      taken.add(fill.account.id);
      members.push(fill);
    }
    // Nobody left to fill it: someone from the map is in it after all.
    if (members.length === 0) {
      const s = pick(shown);
      members.push({ account: accountOn(s, platform), talks: 0.5 });
      taken.add(members[0].account.id);
    }
    // Someone writes there: you, in a big one, or else one of the others.
    if (members.every((m) => m.talks === 0)) {
      if (size > SMALL_GROUP_MAX) myShare = 1;
      else {
        members[0].talks = 0.05;
        wrote.accounts.push(members[0].account);
      }
    }
    const titleOf = kind ?? newTitle(big);
    const title = kind ? kind.title : chance(untitled) ? null : titleOf.title;
    const me = selfAccount.get(platform)!;
    const speaker = sampler(members.map((m) => m.talks), random);
    const chat = addConversation(
      { platform, type: "group", title, marketplace: false, memberAccountIds: [me.id, ...members.map((m) => m.account.id)], topic: titleOf.topic ?? "general" },
      (conversation) =>
        exchanges(
          conversation, count, from, last, () => 1, 9, 30, 1,
          () => (chance(myShare) ? me : members[speaker()].account),
          (index, sender) => react(index, sender === me ? members[speaker()].account : me, 0.008),
        ),
    );
    groupMembers.push({ chat, accounts: taken });
  }
  // Everyone met only in group chats who wrote there wrote something: one of another's messages in their group, whose
  // writer wrote more than that one, is theirs.
  const sent = new Map<number, number>();
  for (let i = 0; i < messages.length; i++) sent.set(messages.sender[i], (sent.get(messages.sender[i]) ?? 0) + 1);
  const selfIds = new Set([...selfAccount.values()].map((a) => a.id));
  for (const account of wrote.accounts) {
    if (sent.has(account.id)) continue;
    const group = groupMembers.find((g) => g.accounts.has(account.id))!;
    for (let tries = 0; tries < 60; tries++) {
      const i = group.chat.start + Math.floor(random() * group.chat.count);
      const from = messages.sender[i];
      if (selfIds.has(from) || (sent.get(from) ?? 0) < 2) continue;
      sent.set(from, sent.get(from)! - 1);
      sent.set(account.id, 1);
      messages.sender[i] = account.id;
      break;
    }
  }

  // The rest of the archived people, as many as on the real map: deleted accounts, Marketplace sellers, one-sided
  // chats, accounts with no name and no group, people archived by hand, and accounts with no messages at all.
  const short = (topic: string, n: number, them: DemoAccount, platform: string, at: number, opener: "me" | "them" | "both") => {
    const me = selfAccount.get(platform)!;
    return addConversation({ platform, type: "direct", title: them.displayName, marketplace: false, memberAccountIds: [me.id, them.id], topic }, (chat) => {
      for (let k = 0; k < n; k++) {
        const sender = opener === "both" ? (k % 2 ? me : them) : opener === "me" ? me : them;
        messages.push(chat.id, sender.id, Math.min(latest, Math.round(at + k * 3 * MINUTE)));
      }
    });
  };
  const oneOf = (list: readonly string[]) => list.filter((p) => platforms.includes(p))[0] ?? platforms[0];
  const unknownCount = scaled(targets.unknown ?? 0);
  for (let i = 0; i < unknownCount; i++) {
    const platform = oneOf(chance(0.8) ? ["messenger"] : ["instagram", "messenger"]);
    const placeholder = platform === "instagram" ? "Instagram user" : "Facebook user";
    const person = addPerson({ name: placeholder });
    short("general", 2 + Math.floor(random() * 6), addAccount(person, platform, placeholder), platform, now - (200 + 3000 * random()) * DAY, "both");
  }
  for (let i = 0; i < scaled(targets.marketplace ?? 0); i++) {
    const person = addPerson();
    const platform = oneOf(["messenger"]);
    const account = addAccount(person, platform);
    const me = selfAccount.get(platform)!;
    const item = MARKETPLACE_ITEMS[i % MARKETPLACE_ITEMS.length];
    const at = now - (60 + 2500 * random()) * DAY;
    addConversation({ platform, type: "direct", title: `${person.name.split(" ")[0]} · ${item}`, marketplace: true, memberAccountIds: [me.id, account.id], topic: "marketplace" }, (chat) => {
      for (let k = 0; k < 4; k++) messages.push(chat.id, (k % 2 ? account : me).id, Math.min(latest, Math.round(at + k * 4 * MINUTE)));
    });
  }
  for (let i = 0; i < scaled(targets["they-only"] ?? 0); i++) {
    const platform = oneOf(chance(0.5) ? ["whatsapp", "imessage"] : ["instagram", "messenger"]);
    short("request", 1 + Math.floor(random() * 2), addAccount(addPerson(), platform), platform, now - (30 + 2500 * random()) * DAY, "them");
  }
  for (let i = 0; i < scaled(targets["you-only"] ?? 0); i++) {
    const platform = oneOf(["messenger", "whatsapp"]);
    short("general", 1 + Math.floor(random() * 2), addAccount(addPerson(), platform), platform, now - (100 + 2500 * random()) * DAY, "me");
  }
  while (unnamed.left > 0) {
    unnamed.left--;
    const platform = oneOf(["whatsapp", "telegram", "signal"]);
    short("general", 2 + Math.floor(random() * 4), addAccount(addPerson({ name: unnamedAddress() }), platform), platform, now - (30 + 2500 * random()) * DAY, "both");
  }
  while (byHand.left > 0) {
    byHand.left--;
    const platform = weighted(platforms, peopleOn);
    const person = addPerson({ tags: [ARCHIVE_TAG], edited: true });
    const account = addAccount(person, platform);
    const last = now - (30 + 2000 * random()) * DAY;
    directChat(platform, selfAccount.get(platform)!, account, "general", 2 + Math.floor(random() ** 3 * 120), last - (30 + 900 * random()) * DAY, last, 0.5);
  }
  // More people met only in group chats than places for them: the rest join the big groups' lists in turn, never writing.
  const big = groupMembers.filter((g) => g.accounts.size > SMALL_GROUP_MAX).sort((a, b) => b.accounts.size - a.accounts.size).slice(0, 20);
  for (let n = quiet.left + wrote.left; n > 0 && big.length > 0; n--) {
    const group = big[n % big.length];
    const account = addAccount(addPerson(), group.chat.platform);
    group.chat.memberAccountIds.push(account.id);
    group.accounts.add(account.id);
  }
  for (let i = 0; i < scaled(targets["no-messages"] ?? 0); i++) addAccount(addPerson(), weighted(platforms, peopleOn));

  // Someone you live with, spoken to lately: in the sun on Orbits, whatever their score.
  shown[1].person.tags.push(LIVE_TOGETHER_TAG);
  shown[1].person.edited = true;
  // And one Hide leaves off to start with.
  const commercial = addPerson({ name: commercialName, tags: [COMMERCIAL_TAG], edited: true });
  const shop = addAccount(commercial, oneOf(["whatsapp"]));
  directChat(shop.platform, selfAccount.get(shop.platform)!, shop, "general", 6 + Math.floor(random() * 20), now - 900 * DAY, now - (20 + 200 * random()) * DAY, 0.5);

  const data: DemoData = { now, selfPersonId: self.id, people, accounts, conversations, messages: messages.done(), tags: [...TAG_ORDER], catchUps: [] };
  data.catchUps = catchUpsOf(data, new Set(shown.map((s) => s.person.id)), scale, seed);
  return data;
}

/**
 * The line of chat message `index` holds: from its chat's topic, an opener when it starts an exchange (the first, or
 * after a quiet spell) and a reply otherwise, picked by where it is; Marketplace chats and one-sided requests have
 * lines of their own. Worked out whenever it is shown, never kept: the same message always reads the same.
 */
export function messageText(data: DemoData, index: number): string {
  const { messages } = data;
  const chat = data.conversations[messages.conversation[index] - 1];
  const k = index - chat.start;
  const h = mix(index * 2654435761 + 97);
  if (chat.topic === "marketplace") return fill(LINES.marketplace[k % 2 ? "replies" : "openers"][Math.floor(k / 2) % 3], h);
  if (chat.topic === "request") return fill(LINES.request.openers[h % LINES.request.openers.length], h);
  const kind = k === 0 || messages.sentAt[index] - messages.sentAt[index - 1] >= QUIET ? "openers" : "replies";
  const own = LINES[chat.topic];
  const pool = own && own[kind].length > 0 && h % 5 < 2 ? own[kind] : LINES.general[kind];
  return fill(pool[(h >>> 3) % pool.length], h);
}

/** Every line of chat the crowd can hold: the pool messageText picks from, each slot filled every way. */
export function everyLine(): string[] {
  const lines = new Set<string>();
  const expand = (line: string): string[] => {
    const slot = /\{(\w+)\}/.exec(line);
    return slot ? (FILLS[slot[1]] ?? [slot[1]]).flatMap((word) => expand(line.replace(slot[0], word))) : [line];
  };
  for (const { openers, replies } of Object.values(LINES)) for (const line of [...openers, ...replies]) for (const filled of expand(line)) lines.add(filled);
  return [...lines];
}

/** A line with its slots filled, each by its own part of the hash `h`. */
function fill(line: string, h: number): string {
  let n = 0;
  return line.replace(/\{(\w+)\}/g, (_, slot: string) => {
    const words = FILLS[slot] ?? [slot];
    return words[mix(h + ++n) % words.length];
  });
}

/**
 * Your hangouts: as many as the real map's over as many days to now, with the people most talked to one to
 * one lately (the closer, the more often), as many people at each and as long, some with a crowd of unnamed others
 * too. Drawn from random number generators of their own, so the rest of the crowd is as it was without them. Everyone
 * at one counts as edited, as real hangouts mark them.
 */
function catchUpsOf(data: DemoData, onMap: ReadonlySet<number>, scale: number, seed: number): DemoCatchUp[] {
  const shape = SHAPE.hangouts;
  if (!shape) return [];
  const random = mulberry32(seed + 1);
  const crowd = mulberry32(seed + 2);
  const { people, accounts, conversations, messages, now } = data;
  // Direct messages in the last year, by person.
  const lately = new Map<number, number>();
  const since = now - 365 * DAY;
  for (const chat of conversations) {
    if (chat.type !== "direct" || chat.marketplace) continue;
    const them = accounts[chat.memberAccountIds[1] - 1].personId;
    let n = 0;
    for (let i = chat.start + chat.count - 1; i >= chat.start && messages.sentAt[i] >= since; i--) n++;
    if (n > 0) lately.set(them, (lately.get(them) ?? 0) + n);
  }
  const circle = people
    .filter((p) => onMap.has(p.id) && (lately.get(p.id) ?? 0) > 0)
    .sort((a, b) => lately.get(b.id)! - lately.get(a.id)! || a.id - b.id)
    .slice(0, Math.max(8, Math.round(60 * scale)));
  if (circle.length === 0) return [];
  const pickOne = sampler(circle.map((_, rank) => 1 / (rank + 3)), random);
  const catchUps: Array<Omit<DemoCatchUp, "id">> = [];
  const count = Math.max(6, Math.round(shape.count * scale));
  for (let i = 0; i < count; i++) {
    const at = now - random() * shape.days * DAY;
    const size = Math.min(circle.length, Math.max(1, Math.floor(draw(shape.sizes, random, { open: 1.5 }))));
    const chosen = new Set<number>();
    while (chosen.size < size) chosen.add(circle[pickOne()].id);
    const hours = Math.max(0.5, Math.round(draw(shape.hours, random, { open: 1.5 }) * 2) / 2);
    const others = size > 1 && crowd() < shape.withOthers / Math.max(1, shape.count) * 2 ? 2 + Math.floor(crowd() * 19) : 0;
    // Two in three say when they started, between 10 am and 8:30 pm, from their place in the list.
    const time = i % 3 === 2 ? null : `${10 + ((i * 7) % 11)}:${i % 2 ? "30" : "00"}`;
    const note = CATCH_UP_NOTES[Math.floor(random() * CATCH_UP_NOTES.length)];
    // By call when its note says so.
    catchUps.push({ day: dayKey(at), trip: null, time, hours, byCall: note === "By video call", note, personIds: [...chosen].sort((a, b) => a - b), others });
  }
  for (const c of catchUps) for (const id of c.personIds) people[id - 1].edited = true;
  return catchUps.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? "")).map((c, i) => ({ id: i + 1, ...c }));
}

/** The months of the real map up to `now`, Melbourne months, each with how busy it was (the shape's activity). */
function monthsOf(now: number) {
  const keys = monthRange(SHAPE.activity.from, monthKey(now));
  const starts = keys.map((month) => dayStart(`${month}-01`));
  const counts = keys.map((_, i) => SHAPE.activity.counts[i] ?? SHAPE.activity.counts.at(-2) ?? 1);
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  // Softened, so the quiet early years still have someone in them.
  const busy = counts.map((n) => Math.max(0.03, n / mean));
  return {
    first: starts[0],
    busy: (index: number) => busy[index],
    /** The months from `from` to `to`, each with where it starts and ends (clipped to `to`). */
    between(from: number, to: number): Array<{ index: number; start: number; end: number }> {
      let i = 0;
      while (i + 1 < starts.length && starts[i + 1] <= from) i++;
      const months: Array<{ index: number; start: number; end: number }> = [];
      for (; i < starts.length && starts[i] < to; i++) months.push({ index: i, start: Math.max(starts[i], from), end: Math.min(starts[i + 1] ?? to, to) });
      return months.length > 0 ? months : [{ index: starts.length - 1, start: from, end: to }];
    },
  };
}

/** The crowd's messages as they are written: columns that grow as they need to. */
class MessageColumns implements DemoMessages {
  length = 0;
  conversation = new Int32Array(1 << 16);
  sender = new Int32Array(1 << 16);
  sentAt = new Float64Array(1 << 16);
  calls = new Map<number, number>();
  reactions = new Map<number, Array<{ actorAccountId: number; emoji: string }>>();

  /** A message, at the end; its place. */
  push(conversation: number, sender: number, at: number): number {
    if (this.length === this.sentAt.length) {
      const grow = <T extends Int32Array | Float64Array>(old: T, made: T): T => (made.set(old), made);
      this.conversation = grow(this.conversation, new Int32Array(this.length * 2));
      this.sender = grow(this.sender, new Int32Array(this.length * 2));
      this.sentAt = grow(this.sentAt, new Float64Array(this.length * 2));
    }
    this.conversation[this.length] = conversation;
    this.sender[this.length] = sender;
    this.sentAt[this.length] = at;
    return this.length++;
  }

  done(): DemoMessages {
    const n = this.length;
    return { length: n, conversation: this.conversation.slice(0, n), sender: this.sender.slice(0, n), sentAt: this.sentAt.slice(0, n), calls: this.calls, reactions: this.reactions };
  }
}

/** `count` shared out by `weights`, whole numbers by largest remainder; each of `atLeastOne` gets one when there are enough. */
function apportion(count: number, weights: number[], atLeastOne: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (count * w) / sum);
  const out = exact.map(Math.floor);
  let left = count - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  for (const i of new Set(atLeastOne)) {
    if (out[i] > 0 || count < atLeastOne.length) continue;
    const richest = out.indexOf(Math.max(...out));
    if (out[richest] > 1) {
      out[richest]--;
      out[i]++;
    }
  }
  return out;
}

/** Draws an index by `weights` (each draw costs a search, not a walk): for picking among hundreds, many times. */
function sampler(weights: readonly number[], random: () => number): () => number {
  const cumulative = new Float64Array(weights.length);
  let sum = 0;
  weights.forEach((w, i) => (cumulative[i] = sum += Math.max(0, w)));
  return () => {
    if (sum === 0) return Math.floor(random() * weights.length);
    const u = random() * sum;
    let [low, high] = [0, weights.length - 1];
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] > u) high = middle;
      else low = middle + 1;
    }
    return low;
  };
}

/** Up to `n` of `list`, none twice, each draw by `weight` among those left. */
function sampleWithout<T>(list: readonly T[], weight: (item: T) => number, n: number, random: () => number): T[] {
  const left = list.map((item) => ({ item, w: Math.max(0, weight(item)) }));
  const out: T[] = [];
  while (out.length < n && left.length > 0) {
    let u = random() * left.reduce((sum, x) => sum + x.w, 0);
    let i = left.length - 1;
    for (let j = 0; j < left.length; j++) if ((u -= left[j].w) < 0) {
      i = j;
      break;
    }
    out.push(left[i].item);
    left.splice(i, 1);
  }
  return out;
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  return shuffleInPlace([...list], random);
}

function shuffleInPlace<T>(out: T[], random: () => number): T[] {
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A standard normal draw (Box-Muller). */
function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** A 32-bit hash of a number (murmur3's finaliser): the same number, the same hash. */
function mix(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A small seeded random number generator, so the crowd is the same every time. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
