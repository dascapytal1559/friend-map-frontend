// Adding someone by hand, with no accounts on any platform: the Table's "Add
// person", someone you know offline, and on Orbits and the Spider web "Add an
// aspiring friend", folded away in the menu at the top left, someone you would
// like to know (src/aspiring.ts). "Add person" in the header opens a small form:
// a name, and if wanted a location (the values in use offered), tags (comma
// between them) and a note; the aspiring friend's has a name and what you would
// say to them, and the tag is given for you. Enter or Add adds them as one
// changeset (POST /api/archive/people), edited by hand, so the archive rules
// never archive them for having no messages; the chip offers Undo, and their
// panel opens, for catch-ups and the rest. When someone already goes by that
// name or an alias (but for case), nobody is added yet: the form names them, each
// to open instead, or adds a second anyway. Not there in demo mode (read-only).

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { type NewPerson, type SameNamed, writtenTag } from "../archive.ts";
import { archiveApi } from "../archiveApi.ts";
import { ASPIRING_TAG } from "../aspiring.ts";
import { addPerson } from "../changeChip.ts";
import { useNames } from "../names.ts";
import { change, Name } from "../PersonParts.tsx";

/** The tags typed in the form's box, commas between them, as they will be stored (written as tags are), without repeats. */
export function typedTags(text: string): string[] {
  return [...new Set(text.split(",").map(writtenTag).filter(Boolean))];
}

/** What the form sends: the name, and only the parts filled in. */
export function newPerson(form: { name: string; location: string; tags: string; note: string }, anyway: boolean): NewPerson {
  const tags = typedTags(form.tags);
  return {
    name: form.name,
    ...(form.location.trim() && { location: form.location }),
    ...(tags.length > 0 && { tags }),
    ...(form.note.trim() && { note: form.note }),
    ...(anyway && { anyway }),
  };
}

const EMPTY = { name: "", location: "", tags: "", note: "" };
/** The aspiring friend's form starts with their tag, which it does not show. */
export const EMPTY_ASPIRING = { ...EMPTY, tags: ASPIRING_TAG };

/** The form: `onOpen` opens someone's panel (the person just added, or one already there picked instead), and `onClose` puts it away. */
function PersonForm({ aspiring = false, onOpen, onClose }: { aspiring?: boolean; onOpen: (person: number) => void; onClose: () => void }) {
  const names = useNames();
  const [form, setForm] = useState(aspiring ? EMPTY_ASPIRING : EMPTY);
  const [sameName, setSameName] = useState<SameNamed[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);

  useEffect(() => {
    if (aspiring) return;
    void archiveApi.locations().then((locations) => setPlaces(locations.map((value) => value.name)), () => setPlaces([]));
  }, [aspiring]);

  const set = (part: keyof typeof EMPTY) => (event: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [part]: event.target.value }));
    if (part === "name") setSameName(null);
  };

  const add = async (anyway: boolean) => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const done = await change(() => addPerson(newPerson(form, anyway)));
    setSaving(false);
    if (!done) return;
    if (done.person) {
      onClose();
      onOpen(done.person.id);
    } else setSameName(done.sameName);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void add(false);
  };

  return (
    <form className="add-person__form" onSubmit={submit}>
      <label>
        <span>Name</span>
        <input autoFocus required value={form.name} onChange={set("name")} placeholder="Their name" />
      </label>
      {!aspiring && (
        <>
          <label>
            <span>Location</span>
            <input list="add-person-places" value={form.location} onChange={set("location")} placeholder="Where they are, if you know" />
            <datalist id="add-person-places">{places.map((place) => <option key={place} value={place} />)}</datalist>
          </label>
          <label>
            <span>Tags</span>
            <input value={form.tags} onChange={set("tags")} placeholder="e.g. friend, climbing" />
          </label>
        </>
      )}
      <label>
        <span>{aspiring ? "What you would say to them" : "Note"}</span>
        <textarea rows={2} value={form.note} onChange={set("note")} />
      </label>
      {sameName ? (
        <div className="tag-manager__confirm add-person__same" role="alert">
          <p>{sameName.length === 1 ? "Someone already goes by this name:" : "These people already go by this name:"}</p>
          {sameName.map((person) => (
            <button key={person.id} type="button" className="tag-manager__button" onClick={() => { onClose(); onOpen(person.id); }}>
              Open <Name text={names.label(person).primary} />
            </button>
          ))}
          <button type="button" className="tag-manager__button" disabled={saving} onClick={() => void add(true)}>Add anyway</button>
        </div>
      ) : (
        <div className="add-person__actions">
          <button type="button" className="tag-manager__button" onClick={onClose}>Cancel</button>
          <button type="submit" className="tag-manager__button add-person__add" disabled={!form.name.trim() || saving}>Add</button>
        </div>
      )}
    </form>
  );
}

/** The Table's "Add person". `onOpen` opens someone's panel. */
export function AddPerson({ onOpen }: { onOpen: (person: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="tag-filter" ref={ref}>
      <button
        type="button"
        className="demos__method"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Add someone you know offline, with no messages: a name, and a location, tags and a note if you like"
        onClick={() => (open ? setOpen(false) : setOpen(true))}
      >
        Add person
      </button>
      {open && (
        <div className="tag-filter__panel add-person" role="dialog" aria-label="Add person">
          <PersonForm onOpen={onOpen} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** "Add an aspiring friend", a section of the menu at the top left, folded until opened. `onOpen` opens someone's panel. */
export function AddAspiring({ onOpen }: { onOpen: (person: number) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="view-switcher__settings" aria-label="Add an aspiring friend">
      <button
        type="button"
        className="view-switcher__group view-switcher__fold"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Someone you would like to know: they sit far out at the edge of the map, with a note for what you would say to them"
        onClick={() => setOpen(!open)}
      >
        <span className="view-switcher__caret" aria-hidden />
        Add an aspiring friend
      </button>
      {open && <div className="add-aspiring" id={id}><PersonForm aspiring onOpen={onOpen} onClose={() => setOpen(false)} /></div>}
    </section>
  );
}
