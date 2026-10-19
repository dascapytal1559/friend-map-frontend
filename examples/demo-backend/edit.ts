// `edit.people`: adding people and changing their names, tags, note, reach-out, location and identicon from the app.
// Each change is written to the database file at once, so it is kept when the backend starts again (npm run
// demo-backend -- --fresh starts over). This backend keeps no change log, so every answer's changeset is null and the
// page offers no Undo. Anyone you change is yours: no rule of the backend's takes them off the map again.

import { BUILT_IN_TAGS, type NewPerson, type PersonAdded, type PersonSaved, type PersonSummary, type SameNamed, type TagsSaved } from "../../src/archive.ts";
import { identiconSeedOf } from "../../src/identicon.ts";
import type { Db } from "./db.ts";
import { badRequest, found, idOf, type Asked, type Route } from "./http.ts";
import { everyone, personById, tagsByPerson } from "./people.ts";

export const EDIT_PEOPLE: Route[] = [
  { capability: "edit.people", method: "POST", path: "/people", answer: (db, { body }) => addPerson(db, body as NewPerson) },
  {
    capability: "edit.people", method: "PUT", path: "/people/:id/names",
    answer: (db, asked) => {
      const names = field<string[]>(asked, "names", (v) => Array.isArray(v) && v.every((n) => typeof n === "string")).map((n) => n.trim()).filter(Boolean);
      if (names.length === 0) throw badRequest("someone needs a name");
      return saved(db, asked, "name = ?, aliases = ?", names[0], JSON.stringify([...new Set(names.slice(1))]));
    },
  },
  { capability: "edit.people", method: "PUT", path: "/people/:id/tags", answer: (db, asked) => setTags(db, idOf(asked), field<string[]>(asked, "tags", isStrings)) },
  { capability: "edit.people", method: "PUT", path: "/people/:id/note", answer: (db, asked) => saved(db, asked, "note = ?", field<string>(asked, "note", isString)).person },
  {
    capability: "edit.people", method: "PUT", path: "/people/:id/should-reach-out",
    answer: (db, asked) => saved(db, asked, "should_reach_out = ?", field<boolean>(asked, "shouldReachOut", (v) => typeof v === "boolean") ? 1 : 0).person,
  },
  {
    capability: "edit.people", method: "PUT", path: "/people/:id/location",
    answer: (db, asked) => saved(db, asked, "location = ?", field<string | null>(asked, "location", (v) => v === null || isString(v))?.trim() || null),
  },
  {
    capability: "edit.people", method: "PUT", path: "/people/:id/identicon",
    answer: (db, asked) => saved(db, asked, "identicon_seed = ?, identicon_hue = ?",
      field<string>(asked, "seed", (v) => isString(v) && v !== ""), field<number | null>(asked, "hue", (v) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 360))),
  },
];

const isString = (v: unknown) => typeof v === "string";
const isStrings = (v: unknown) => Array.isArray(v) && v.every(isString);

/** The body's `key`, or a 400 when it is not what `fits` wants. */
function field<T>(asked: Asked, key: string, fits: (value: unknown) => boolean): T {
  const value = (asked.body as Record<string, unknown> | null)?.[key];
  if (!fits(value)) throw badRequest(`${key} is missing or of the wrong kind`);
  return value as T;
}

/** Sets `set` (SQL, with `values`) on the person the path names, who is then yours; them after it. */
function saved(db: Db, asked: Asked, set: string, ...values: Array<string | number | null>): PersonSaved {
  const id = idOf(asked);
  found(personById(db, id), "such person");
  db.run(`UPDATE people SET ${set}, edited = 1 WHERE id = ?`, ...values, id);
  return { person: personById(db, id)!, changeset: null };
}

/** A tag as the contract writes them: lowercase, with dashes for spaces. */
function tagName(text: string): string {
  const tag = text.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(tag)) throw badRequest(`"${text}" is not a tag: use letters, numbers and dashes`);
  return tag;
}

/** Gives someone exactly `wanted` tags: new ones go at the end of your tags, and a tag nobody has any more is deleted. */
function setTags(db: Db, id: number, wanted: string[]): TagsSaved {
  found(personById(db, id), "such person");
  const tags = [...new Set(wanted.map(tagName))];
  const before = tagsByPerson(db).get(id) ?? [];
  const known = new Set(db.all<{ name: string }>("SELECT name FROM tags").map((t) => t.name));
  const created = tags.filter((tag) => !known.has(tag));
  const deleted: string[] = [];
  db.transaction(() => {
    for (const tag of created) db.run("INSERT INTO tags (name, position) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM tags))", tag);
    db.run("DELETE FROM person_tags WHERE person_id = ?", id);
    for (const tag of tags) db.run("INSERT INTO person_tags (person_id, tag) VALUES (?, ?)", id, tag);
    for (const tag of before.filter((t) => !tags.includes(t) && !BUILT_IN_TAGS.includes(t))) {
      if (db.one("SELECT 1 FROM person_tags WHERE tag = ?", tag)) continue;
      db.run("DELETE FROM tags WHERE name = ?", tag);
      deleted.push(tag);
    }
    db.run("UPDATE people SET edited = 1 WHERE id = ?", id);
  });
  return { person: personById(db, id)!, changeset: null, created, deleted };
}

/** Adds someone by hand; unless `anyway`, nobody when someone already goes by that name, and who does. */
function addPerson(db: Db, person: NewPerson): PersonAdded {
  const name = typeof person?.name === "string" ? person.name.trim() : "";
  if (name === "") throw badRequest("someone needs a name");
  if (!person.anyway) {
    const sameName: SameNamed[] = everyone(db)
      .filter((p: PersonSummary) => [p.name, ...p.aliases].some((n) => n.toLowerCase() === name.toLowerCase()))
      .map(({ id, name, aliases }) => ({ id, name, aliases }));
    if (sameName.length > 0) return { person: null, changeset: null, sameName };
  }
  // A tag that is none is refused before anyone is added.
  person.tags?.forEach(tagName);
  const now = Date.now();
  const id = db.transaction(() => {
    const id = db.run("INSERT INTO people (name, note, location, identicon_seed, edited, added_at) VALUES (?, ?, ?, '', 1, ?)",
      name, person.note ?? "", person.location?.trim() || null, now);
    db.run("UPDATE people SET identicon_seed = ? WHERE id = ?", identiconSeedOf(id, now), id);
    return id;
  });
  if (person.tags?.length) setTags(db, id, person.tags);
  return { person: personById(db, id)!, changeset: null, sameName: [] };
}
