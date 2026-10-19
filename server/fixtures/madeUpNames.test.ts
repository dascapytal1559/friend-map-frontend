import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIRST_NAMES as DEMO_FIRST, LAST_NAMES as DEMO_LAST, SELF_NAME as DEMO_SELF } from "../../src/demo/words.ts";
import { CROWD_FIRST, CROWD_LAST, FIRST_NAMES, isMadeUpName, LAST_NAMES, madeUpName, WHOLE_NAMES } from "./madeUpNames.ts";

const ROOT = new URL("../../", import.meta.url).pathname;

// What the tests write that reads like a name but is not one.
const NOT_NAMES = [
  "Audio Message", "Both Different", "Both Same", "Call Duration", "Claude Code", "Climbing Crew", "Climbing Sunday",
  "Crowd Member", "Daily News", "Deleted User", "Direct Message", "Edited Name", "File Transfer", "Former Flatmate", "From Messenger", "Gold Coast", "Grove Street",
  "Hey Cleo", "Hi Ada", "Hi Cleo", "Instagram User", "Invited Ada", "Lives Only", "Lorem Crew", "Merry Christmas", "Met Only",
  "Met Too", "New York", "Night Owls", "Other Name", "Plumbing Co", "Put Dot", "Sample Labs", "Sample Person", "Sample Server",
  "Sample Walkers", "Saved Messages", "Since Aug", "Someone Else", "Take Ada", "Take Bea", "Tent Guy", "The Sample", "Took Dot",
  "Toowoomba City", "Two Words", "Uni Friends", "Unknown Participant", "Welcome Cleo", "West End",
];

/** Each line of the tests and fixtures, with where it is. */
function lines(): Array<{ line: string; where: string }> {
  const files = globSync(["**/*.test.ts", "**/*.test.tsx", "server/fixtures/*.ts"], {
    cwd: ROOT,
    // Never into data/, which is private, nor into what is installed or built.
    exclude: (path) => /^(?:data|dist[^/]*)(?:\/|$)|(?:^|\/)node_modules(?:\/|$)/.test(path),
  });
  return files.flatMap((file) => readFileSync(ROOT + file, "utf8").split("\n").map((line, i) => ({ line, where: `${file}:${i + 1}` })));
}

/** Each quoted string in the tests and fixtures that starts with two capitalised words, with where it is. */
function quotedPairs(): Array<{ pair: string; where: string }> {
  return lines().flatMap(({ line, where }) => [...line.matchAll(/["'`]([A-Z][a-z]+ [A-Z][a-z]+)\b/g)].map((m) => ({ pair: m[1]!, where })));
}

/**
 * Each name the tests and fixtures give someone, as a name: value or one of
 * their aliases, in any shape (one word, short, or not in Latin letters), with
 * where it is. Only what reads as a name: letters, spaces and dots.
 */
function givenNames(): Array<{ name: string; where: string }> {
  const quoted = (text: string) => [...text.matchAll(/(["'])((?:(?!\1).)*)\1/g)].map((m) => m[2]!);
  return lines().flatMap(({ line, where }) =>
    [...line.matchAll(/\bname: (["'])((?:(?!\1).)*)\1/g)].map((m) => m[2]!)
      .concat([...line.matchAll(/\baliases: \[([^\]]*)\]/g)].flatMap((m) => quoted(m[1]!)))
      .filter((name) => /^[\p{L}][\p{L}\p{M} .]*$/u.test(name))
      .map((name) => ({ name, where })));
}

/** Whether a name is a made-up one, the demo crowd's, a pool's name alone (in any case), or a pool's first name and an initial. */
function poolName(name: string): boolean {
  const [first, ...rest] = name.split(" ");
  const alone = (list: readonly string[]) => list.some((word) => word.toLowerCase() === name.toLowerCase());
  return isMadeUpName(name) || name === DEMO_SELF || (DEMO_FIRST.includes(first!) && rest.length === 1 && DEMO_LAST.includes(rest[0]!)) ||
    alone(FIRST_NAMES) || alone(LAST_NAMES) || alone(DEMO_FIRST) ||
    (FIRST_NAMES.includes(first!) && rest.length === 1 && /^\p{Lu}\.?$/u.test(rest[0]!));
}

describe("made-up names", () => {
  it("name everyone the tests and fixtures name, with the demo crowd's, or the pair is not a name", () => {
    const known = (pair: string) => poolName(pair) || WHOLE_NAMES.some((name) => name.startsWith(`${pair} `)) || NOT_NAMES.includes(pair);
    const unknown = quotedPairs().filter(({ pair }) => !known(pair)).map(({ pair, where }) => `${where} ${pair}`);
    // A new made-up name goes in madeUpNames.ts first; an ordinary phrase goes in NOT_NAMES.
    expect(unknown).toEqual([]);
  });

  it("are every name and alias the tests and fixtures give someone, short, one word or not in Latin letters", () => {
    const unknown = givenNames().filter(({ name }) => !poolName(name) && !NOT_NAMES.includes(name)).map(({ name, where }) => `${where} ${name}`);
    // As above: a new made-up name goes in madeUpNames.ts first.
    expect(unknown).toEqual([]);
  });

  it("keep the crowd's pools first, and none twice", () => {
    expect(FIRST_NAMES.slice(0, CROWD_FIRST.length)).toEqual(CROWD_FIRST);
    expect(LAST_NAMES.slice(0, CROWD_LAST.length)).toEqual(CROWD_LAST);
    for (const list of [FIRST_NAMES, LAST_NAMES, WHOLE_NAMES]) expect(new Set(list).size).toBe(list.length);
  });

  it("share no name with the demo crowd's", () => {
    expect(FIRST_NAMES.filter((name) => DEMO_FIRST.includes(name))).toEqual([]);
    expect(LAST_NAMES.filter((name) => DEMO_LAST.includes(name))).toEqual([]);
  });

  it("give as many different names as the pools make", () => {
    const count = FIRST_NAMES.length * LAST_NAMES.length;
    const names = Array.from({ length: count }, (_, n) => madeUpName(n));
    expect(new Set(names).size).toBe(count);
    expect(names.every(isMadeUpName)).toBe(true);
    expect(madeUpName(0)).toBe("Ada Sample");
    expect(madeUpName(count)).toBe("Ada Sample");
  });
});
