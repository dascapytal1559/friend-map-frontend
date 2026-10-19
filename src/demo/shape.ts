// The shape of a map in numbers: the counts and distributions
// server/demo-shape.ts works out from your archive's facts
// into mapShape.ts, which the static demo's made-up crowd (generate.ts) is
// tuned to. Only counts here, never a name, an alias, a title, a handle, an id
// or a message, so mapShape.ts can be checked in.

/** One bar of a histogram: how many fell in [from, to); the last bar is open-ended (`to` null). */
export interface Bucket {
  from: number;
  to: number | null;
  count: number;
}

export type Histogram = Bucket[];

export interface DemoShape {
  /** The month the numbers were taken in. */
  takenAt: string;
  people: {
    /** On the map: archived neither by hand nor by the rules. */
    shown: number;
    archivedByHand: number;
    /** By the automatic rule that archived them (server/archive/archiving.ts). */
    archivedByRule: Record<string, number>;
    /** Marked to reach out to (Orbits' glow), among those shown. */
    reachOut: number;
  };
  /** One-to-one messages both ways plus theirs in group chats, over the people shown. */
  messagesPerPerson: Histogram;
  /** Your share of a one-to-one chat, 0 to 1, over the people shown with one. */
  myShare: Histogram;
  /** Days since the last message, over the people shown with one. */
  lastSpoke: Histogram;
  /** Years since the first message, over the people shown with one; null in a shape taken before the archive's server gave the map's report. */
  firstSpoke: Histogram | null;
  /**
   * Closeness now (src/demos/closeness.ts, at the default settings, with the hangouts and calls, as the map scores it),
   * over the people shown, the first bar those with none at all (the belt on Orbits); null as firstSpoke.
   */
  closeness: Histogram | null;
  /** Per platform: how many people shown have an account there, and how many messages it holds, all time (system messages aside). */
  platforms: Record<string, { people: number; messages: number }>;
  /** How many platforms each person shown has an account on. */
  platformsPerPerson: Histogram;
  groups: {
    count: number;
    /** How many have a title; the rest are named by their members. */
    titled: number;
    /** People in each, you included, as listed. */
    sizes: Histogram;
    /** People shown on the map in each. */
    shown: Histogram;
    /** Messages in each, all time. */
    messages: Histogram;
    /** Your share of each group's messages, over groups with any. */
    myShare: Histogram;
    /** Days since each one's last message, over groups with any. */
    lastSpoke: Histogram;
    /** Years from each one's first message to its last, over groups with any. */
    years: Histogram;
    /** Group chats per person shown. */
    perPerson: Histogram;
  };
  tags: {
    /** Tags in the tag table. */
    count: number;
    /** People per tag. */
    peoplePerTag: Histogram;
    /** Tags per person shown ("archive" and "keep" aside). */
    perPerson: Histogram;
  };
  /** How many people shown have each field said, and how many values the field has. */
  fields: Record<"location", { people: number; values: number }>;
  /** Reactions between you and the people shown, all time; null as firstSpoke. */
  reactions: { fromMe: number; fromThem: number } | null;
  /** One-to-one chats picked up again after a quiet stretch, by who wrote first; null as firstSpoke. */
  openings: { byMe: number; byThem: number } | null;
  /** Messages a month over the whole archive from `from` (YYYY-MM, UTC) on, system messages aside. */
  activity: { from: string; counts: number[] };
  /**
   * Calls with the people shown (the phone's, the other apps' in one-to-one chats, and those you logged); null
   * for an archive with none.
   */
  calls: {
    /** Answered calls of known length. */
    answered: number;
    /** Calls never answered. */
    missed: number;
    /** People shown with an answered call of known length. */
    people: number;
    /** Answered calls of known length per person, over those people. */
    perPerson: Histogram;
    /** How long each answered call of known length was, in minutes. */
    minutes: Histogram;
    /** Answered calls of known length a month from `from` (YYYY-MM, Melbourne) on. */
    activity: { from: string; counts: number[] };
  } | null;
  /** Your hangouts (catch-ups); null for an archive with none. */
  hangouts: {
    count: number;
    /** Days from the first one's day to when the numbers were taken. */
    days: number;
    /** People named at each. */
    sizes: Histogram;
    /** How long each lasted, in hours. */
    hours: Histogram;
    /** How many had unnamed others there too. */
    withOthers: number;
  } | null;
}

/** Counts `values` into bars starting at each of `edges` (ascending); a value below the first edge is not counted. */
export function histogram(values: Iterable<number>, edges: readonly number[]): Histogram {
  const bars: Histogram = edges.map((from, i) => ({ from, to: edges[i + 1] ?? null, count: 0 }));
  for (const value of values) {
    if (value < bars[0].from) continue;
    let i = bars.length - 1;
    while (i > 0 && value < bars[i].from) i--;
    bars[i].count++;
  }
  return bars;
}

/** How many a histogram counted. */
export function total(bars: Histogram): number {
  return bars.reduce((sum, bar) => sum + bar.count, 0);
}

/**
 * A value drawn from a histogram: a bar by its count, then a point in it,
 * evenly, or with `log`, for counts spanning orders of magnitude, evenly in the
 * log. The open last bar is taken as reaching `open` times its start.
 */
export function draw(bars: Histogram, random: () => number, { log = false, open = 3 } = {}): number {
  const sum = total(bars);
  if (sum === 0) return bars[0]?.from ?? 0;
  let u = random() * sum;
  let bar = bars[bars.length - 1];
  for (const candidate of bars) {
    u -= candidate.count;
    if (u < 0) {
      bar = candidate;
      break;
    }
  }
  const from = bar.from;
  const to = bar.to ?? Math.max(from * open, from + 1);
  if (log && from > 0) return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * random());
  return from + (to - from) * random();
}
