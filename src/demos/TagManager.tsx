// The Table's tag manager: "Tags" in the header opens a panel listing every
// tag in the tag table, in its order, with how many people have it. Drag a tag
// (or Alt+↑/↓ on it) to move it; Hide follows the
// order. Click a name to rename it for everyone: onto a tag that exists, the
// two are merged, after a confirm. × deletes a tag from everyone, after a
// confirm that says how many have it. "archive" and "keep" are built in: they
// move, but are never renamed or deleted. A box at the foot adds a tag nobody
// has yet. Every change goes to the server at once (archiveApi) and every view reloads;
// a tag made or deleted shows the chip (changeChip.ts), with Undo.

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type TagInfo, writtenTag } from "../archive.ts";
import { archiveApi } from "../archiveApi.ts";
import { createTag, deleteTag } from "../changeChip.ts";
import { change } from "../PersonParts.tsx";
import { inOrder, moveTo, renameOutcome } from "./tagManager.ts";
import { number } from "./view.tsx";

type Confirm = { kind: "delete"; tag: TagInfo } | { kind: "merge"; from: TagInfo; into: TagInfo };

/** `onRenamed` hears each rename (or merge) once it is saved, so the page can carry the tag's Hide switch over. */
export function TagManager({ tags, onRenamed }: {
  tags: readonly TagInfo[];
  onRenamed: (from: string, to: string, merged: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The order shown while a tag is dragged, and until the moved list comes back.
  const [order, setOrder] = useState<string[] | null>(null);
  const dragged = useRef<{ name: string; dropped: boolean } | null>(null);
  const [editing, setEditing] = useState<{ name: string; draft: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setOrder(null), [tags]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = inOrder(tags, order);
  const names = shown.map((tag) => tag.name);

  const move = (name: string, position: number) => {
    const next = moveTo(names, name, position);
    if (next.indexOf(name) === tags.findIndex((tag) => tag.name === name)) return setOrder(null);
    setOrder(next);
    void change(() => archiveApi.moveTag(name, next.indexOf(name))).then((done) => done === undefined && setOrder(null));
  };

  const rename = (from: string, to: string, merged: boolean) =>
    void change(() => archiveApi.renameTag(from, to)).then((done) => done !== undefined && onRenamed(from, to, merged));

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const outcome = renameOutcome(tags, editing.name, editing.draft);
    const from = tags.find((tag) => tag.name === editing.name);
    setEditing(null);
    if (outcome.kind === "rename") rename(editing.name, outcome.to, false);
    else if (outcome.kind === "merge" && from) setConfirm({ kind: "merge", from, into: outcome.into });
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const name = writtenTag(draft);
    if (!name) return;
    if (tags.some((tag) => tag.name === name)) return setNotice(`There is already a tag “${name}”.`);
    setNotice(null);
    void change(() => createTag(name)).then((done) => done !== undefined && setDraft(""));
  };

  const onRowKey = (event: KeyboardEvent<HTMLLIElement>, name: string) => {
    if (event.target !== event.currentTarget || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    move(name, names.indexOf(name) + (event.key === "ArrowUp" ? -1 : 1));
  };

  return (
    <div className="tag-filter" ref={ref}>
      <button
        type="button"
        className="demos__method"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Manage tags"
        title="Add, rename, delete and order the tags"
        onClick={() => setOpen((o) => !o)}
      >
        Tags
      </button>
      {open && (
        <div className="tag-filter__panel tag-manager" role="dialog" aria-label="Tags">
          <ol className="tag-manager__list" aria-label="Tags, in order: drag one, or press Alt and an arrow key, to move it">
            {shown.map((tag) => (
              <TagRow
                key={tag.name}
                tag={tag}
                dragging={dragged.current?.name === tag.name}
                editing={editing?.name === tag.name ? editing.draft : null}
                confirm={confirm && (confirm.kind === "delete" ? confirm.tag.name : confirm.from.name) === tag.name ? confirm : null}
                onKeyDown={(event) => onRowKey(event, tag.name)}
                onDragStart={() => {
                  dragged.current = { name: tag.name, dropped: false };
                  setConfirm(null);
                }}
                onDragOver={() => {
                  const name = dragged.current?.name;
                  if (name && name !== tag.name) setOrder(moveTo(names, name, names.indexOf(tag.name)));
                }}
                onDrop={() => {
                  if (!dragged.current) return;
                  dragged.current.dropped = true;
                  move(dragged.current.name, names.indexOf(dragged.current.name));
                }}
                onDragEnd={() => {
                  if (!dragged.current?.dropped) setOrder(null);
                  dragged.current = null;
                }}
                onEdit={(draft) => setEditing({ name: tag.name, draft })}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditing(null)}
                onDelete={() => setConfirm({ kind: "delete", tag })}
                onConfirm={() => {
                  setConfirm(null);
                  if (!confirm) return;
                  if (confirm.kind === "delete") void change(() => deleteTag(confirm.tag.name));
                  else rename(confirm.from.name, confirm.into.name, true);
                }}
                onCancelConfirm={() => setConfirm(null)}
              />
            ))}
          </ol>
          <form className="tag-manager__add" onSubmit={add}>
            <input
              aria-label="New tag"
              placeholder="New tag, e.g. uni-friends"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setNotice(null);
              }}
            />
            <button type="submit" className="tag-manager__button" disabled={!writtenTag(draft)}>Add</button>
          </form>
          {notice && <p className="tag-manager__notice" role="status">{notice}</p>}
        </div>
      )}
    </div>
  );
}

function TagRow({ tag, dragging, editing, confirm, ...on }: {
  tag: TagInfo;
  dragging: boolean;
  /** The name being typed, while renaming. */
  editing: string | null;
  confirm: Confirm | null;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onEdit: (draft: string) => void;
  onSaveEdit: (event: FormEvent) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const people = (n: number) => `${number(n)} ${n === 1 ? "person" : "people"}`;
  return (
    <li
      className={`tag-manager__row${dragging ? " tag-manager__row--dragging" : ""}`}
      tabIndex={0}
      draggable={editing === null}
      aria-label={`${tag.name}, ${people(tag.count)}`}
      onKeyDown={on.onKeyDown}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", tag.name);
        on.onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        on.onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        on.onDrop();
      }}
      onDragEnd={on.onDragEnd}
    >
      <div className="tag-manager__line">
        <span className="tag-manager__grip" aria-hidden title="Drag to move">⠿</span>
        {editing !== null ? (
          <form className="tag-manager__rename" onSubmit={on.onSaveEdit}>
            <input
              aria-label={`Rename ${tag.name}`}
              title="Enter renames it for everyone; Esc cancels"
              autoFocus
              value={editing}
              onChange={(event) => on.onEdit(event.target.value)}
              onBlur={on.onCancelEdit}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                on.onCancelEdit();
              }}
            />
          </form>
        ) : tag.builtIn ? (
          <span className="tag-manager__name" title="Built in: it can be moved, but not renamed or deleted">{tag.name}</span>
        ) : (
          <button type="button" className="tag-manager__name" title="Rename it for everyone" onClick={() => on.onEdit(tag.name)}>{tag.name}</button>
        )}
        <span className="tag-filter__count">{number(tag.count)}</span>
        {tag.builtIn ? (
          <span className="tag-manager__built-in">built in</span>
        ) : (
          <button type="button" className="tag-manager__delete" aria-label={`Delete ${tag.name}`} title="Delete it from everyone" onClick={on.onDelete}>×</button>
        )}
      </div>
      {confirm && (
        <div className="tag-manager__confirm" role="alertdialog" aria-label={confirm.kind === "delete" ? "Delete tag?" : "Merge tags?"}>
          <p>
            {confirm.kind === "delete"
              ? <>Delete “{tag.name}”? {tag.count === 0 ? "Nobody has it." : `It is taken from ${people(tag.count)}.`}</>
              : <>“{confirm.into.name}” is a tag already. Merge “{tag.name}” ({people(tag.count)}) into it? Everyone with “{tag.name}” will have “{confirm.into.name}”, and “{tag.name}” is gone.</>}
          </p>
          <button type="button" className="tag-manager__button tag-manager__button--danger" autoFocus onClick={on.onConfirm}>
            {confirm.kind === "delete" ? "Delete" : "Merge"}
          </button>
          <button type="button" className="tag-manager__button" onClick={on.onCancelConfirm}>Cancel</button>
        </div>
      )}
    </li>
  );
}
