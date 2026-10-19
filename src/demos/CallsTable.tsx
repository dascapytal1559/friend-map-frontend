// The Table's Calls (TablePage.tsx, with "Calls" picked at the top of its
// header): one row per call, from every source (the phone's call history, the
// apps' call records in chats and calls lists, and the calls you
// logged), the newest first to start with, so you can go through them: when,
// who (a chip each, which opens their panel on their chat at the call,
// outlined there, then "+2 others" for those not named), the app and where it comes from, whether it was answered (Yes or
// No), its length and its note. Every header sorts (again to turn it
// round; callsTable.ts). Clicking a row (or Enter on it) opens the panel of
// the first on it; the arrow keys move between rows. Its When opens the
// Calendar at that day (WhenCell.tsx). Rows of whoever's panel
// is open are marked. Only the rows in sight are drawn, each one height, as
// the People table's are (Table.tsx).
//
// Where calls can be changed: the Length cell sets a call's length, in place,
// where the call takes one: a call record whose app does not say how long it
// was (call_length, as the chat's "Add length" does; empty takes it away) and
// a call you logged (its whole group, as Add event's Call changes it). An
// imported call whose source says is shown as it is, with where it comes from.
// The Note cell sets any call's note (empty takes it away). Enter or leaving
// the box saves, Escape does not; each save is one changeset with the chip's
// Undo, and shows at once. From the first, the rows hold their order and who
// is in them (TablePage.tsx). Names go through useNames, and notes hide with
// them (and are not changed then); a read-only page changes nothing.
//
// A call you logged has a red ✕ in the narrow last column, which deletes it for
// everyone on it, as Delete in its chat does, with the chip's Undo (no confirm,
// as the Hangouts' Delete); an imported call has none. "Add call" in the
// header (AddEvent.tsx) logs one with anyone.

import { Fragment, type KeyboardEvent, memo, type ReactNode, useEffect, useRef, useState } from "react";
import type { CallAnswer, ListedCall } from "../archive.ts";
import { archiveApi } from "../archiveApi.ts";
import { CALL_LENGTH_MOST_MINUTES, callLengthText, parseCallLength } from "../calls.ts";
import { callDraftOf, callInput, removeCall, saveCall } from "../CatchUps.tsx";
import { catchUpWhen, othersLabel, timeLabel } from "../catchUps.ts";
import { callMoment, type ChatMoment } from "../chatDays.ts";
import { saveCallAnswered, saveCallLength, saveCallNote } from "../changeChip.ts";
import { reportError } from "../errors.ts";
import { useNames } from "../names.ts";
import { change, Name } from "../PersonParts.tsx";
import { useReadOnly } from "../readOnly.ts";
import { dayKey, timeOfDay } from "../time.ts";
import {
  answeredHint, answeredLabel, callAnswer, callApp, callKey, callMedium, type CallColumn, type CallPeople, type CallSort, lengthByHand, lengthHint, lengthLabel,
  loggedToDelete, sourceHint,
} from "./callsTable.ts";
import { keepFromRow, moveUpOrDown } from "./LocationCell.tsx";
import "./table.css";
import { useSize } from "./view.tsx";
import type { Navigate } from "../ViewSwitcher.tsx";
import { WhenCell } from "./WhenCell.tsx";

/** Every row is this tall, so the rows in sight follow from the scroll position alone. */
const ROW = 34;
/** Rows drawn beyond each edge of the scroller, so a quick scroll shows no gap. */
const OVERSCAN = 12;

interface Column {
  key: CallColumn;
  title: string;
  width: number;
  hint?: string;
  /** Set on its header and every cell, for a column laid out apart (Answered's right edge). */
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "at", title: "When", width: 170 },
  { key: "who", title: "Who", width: 310 },
  { key: "app", title: "App", width: 230, hint: "What it was on (its tooltip says where it comes from)" },
  { key: "answered", title: "Answered", width: 128, className: "calls-table__answered" },
  {
    key: "length",
    title: "Length",
    width: 190,
    hint: "How long it was connected: as its source says, or as you said. One whose source does not say can be given a length, which counts toward closeness",
  },
  { key: "note", title: "Note", width: 320 },
];

/** The last column, unsorted and untitled: ✕ on a call you logged. */
const DELETE_WIDTH = 36;

/** `top` is the header's height (without its padding): the table starts under it. */
export function CallsTable({ rows, sort, onSort, people, openId, onOpen, onOpenAt, navigate, onEdit, top: offset }: {
  rows: readonly ListedCall[];
  sort: CallSort;
  onSort: (column: CallColumn) => void;
  /** Who is on them, by id (the Table's people). */
  people: CallPeople;
  openId: number | null;
  onOpen: (id: number) => void;
  /** Opens someone's panel on their chat at a call (a chip in Who). */
  onOpenAt: (id: number, moment: ChatMoment) => void;
  /** For When, which opens the Calendar. */
  navigate: Navigate;
  /** Called as a call is changed here, before it is saved: the rows then hold where they are. */
  onEdit: () => void;
  top: number;
}) {
  const [scrollerRef, size] = useSize<HTMLDivElement>();
  const [top, setTop] = useState(0);
  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((top + size.height) / ROW) + OVERSCAN);
  return (
    <div className="people-table calls-table" style={{ top: offset + 24 }} ref={scrollerRef} onScroll={(event) => setTop(event.currentTarget.scrollTop)}>
      <table style={{ width: COLUMNS.reduce((sum, c) => sum + c.width, DELETE_WIDTH) }} aria-rowcount={rows.length + 1}>
        <colgroup>
          {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          <col style={{ width: DELETE_WIDTH }} />
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={c.className} aria-sort={sort.column === c.key ? (sort.descending ? "descending" : "ascending") : undefined}>
                <button type="button" title={c.hint} onClick={() => onSort(c.key)}>
                  {c.title}
                  <span className="people-table__arrow" aria-hidden>{sort.column === c.key ? (sort.descending ? "↓" : "↑") : ""}</span>
                </button>
              </th>
            ))}
            <th scope="col" className="calls-table__delete-cell"><span className="visually-hidden">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {first > 0 && <tr aria-hidden style={{ height: first * ROW }} />}
          {rows.slice(first, last).map((call, i) => (
            <CallRow
              key={callKey(call)}
              call={call}
              index={first + i}
              people={people}
              open={openId !== null && call.people.includes(openId)}
              onOpen={onOpen}
              onOpenAt={onOpenAt}
              navigate={navigate}
              onEdit={onEdit}
            />
          ))}
          {last < rows.length && <tr aria-hidden style={{ height: (rows.length - last) * ROW }} />}
        </tbody>
      </table>
      {rows.length === 0 && <p className="people-table__empty">No calls here.</p>}
    </div>
  );
}

/** Moves focus to the row before or after `row`, if one is drawn, keeping it clear of the sticky header. */
function focusRow(row: HTMLTableRowElement, step: 1 | -1): void {
  const next = step === 1 ? row.nextElementSibling : row.previousElementSibling;
  if (!(next instanceof HTMLTableRowElement) || next.tabIndex < 0) return;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest" });
}

/** Drawn again only when its own props change, so a change to one call redraws just its row. */
const CallRow = memo(function CallRow({ call, index, people, open, onOpen, onOpenAt, navigate, onEdit }: {
  call: ListedCall;
  index: number;
  people: CallPeople;
  open: boolean;
  onOpen: (id: number) => void;
  onOpenAt: (id: number, moment: ChatMoment) => void;
  navigate: Navigate;
  onEdit: () => void;
}) {
  const names = useNames();
  const readOnly = useReadOnly();
  const named = call.people.flatMap((id) => people.get(id) ?? []);
  const day = catchUpWhen(dayKey(call.at));
  const medium = callMedium(call);
  const app = `${callApp(call)}${medium === "video" ? " video" : ""}`;
  const logged = loggedToDelete(call);
  const cell = (column: CallColumn): ReactNode => {
    switch (column) {
      case "at": return (
        <WhenCell when={<>{day}<span className="people-table__secondary"> {timeLabel(timeOfDay(call.at))}</span></>} day={dayKey(call.at)} navigate={navigate} />
      );
      case "who": return (
        <td className="calls-table__who" title={names.hidden ? undefined : [...named.map((p) => names.label(p).primary), ...(call.others > 0 ? [othersLabel(call.others)] : [])].join(", ")} onClick={keepFromRow}>
          {named.map((p) => (
            <button key={p.id} type="button" className="tag-chip tag-chip--alias" title="Open their chat at this call" onClick={() => onOpenAt(p.id, callMoment(call))}>
              <Name text={names.label(p).primary} />
            </button>
          ))}
          {call.others > 0 && <span className="people-table__secondary"> {othersLabel(call.others)}</span>}
        </td>
      );
      case "app": return <td title={`${app}: ${sourceHint(call)}`}>{app}</td>;
      case "answered": return <AnsweredCell call={call} day={day} editable={!readOnly && call.source !== "logged"} onEdit={onEdit} />;
      case "length": return <LengthCell call={call} day={day} editable={!readOnly && call.lengthEditable} onEdit={onEdit} />;
      case "note": return <NoteCell call={call} day={day} editable={!readOnly && !names.hidden} hidden={names.hidden} onEdit={onEdit} />;
    }
  };
  const deleteCell = (
    <td className="calls-table__delete-cell">
      {logged && !readOnly && (
        <button
          type="button"
          className="calls-table__delete"
          title="Delete this call"
          aria-label="Delete this call"
          onClick={(event) => {
            keepFromRow(event);
            void removeCall(logged);
          }}
        >
          ✕
        </button>
      )}
    </td>
  );
  const first = named[0]?.id;
  return (
    <tr
      aria-rowindex={index + 2}
      aria-selected={open}
      className={`${index % 2 ? "people-table__odd" : ""}${open ? " people-table__open" : ""}`.trim() || undefined}
      tabIndex={0}
      style={{ height: ROW }}
      onClick={() => first !== undefined && onOpen(first)}
      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Enter" && event.target === event.currentTarget) {
          if (first !== undefined) onOpen(first);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") focusRow(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
        else return;
        event.preventDefault();
      }}
    >
      {COLUMNS.map((c) => <Fragment key={c.key}>{cell(c.key)}</Fragment>)}
      {deleteCell}
    </tr>
  );
});

/**
 * Something just typed in a cell, shown until the row is loaded again after it is saved (or the save fails), so it
 * shows at once; an undo straight after then shows too.
 */
function usePending<T>(call: ListedCall): [T | undefined, (value: T, save: () => Promise<boolean>) => void] {
  const [pending, setPending] = useState<{ value: T; saved: boolean } | null>(null);
  useEffect(() => setPending((last) => (last?.saved ? null : last)), [call]);
  return [pending?.value, (value, save) => {
    const mine = { value, saved: false };
    setPending(mine);
    void save().then((saved) => setPending((last) => (last !== mine ? last : saved ? { ...mine, saved: true } : null)));
  }];
}

/**
 * Whether a call was answered: on an imported call, a select (Yes, No, or empty for not known) that sets
 * your answer over its source's (the same as its source's takes yours away), the tooltip saying whose it is; on one
 * you logged (answered), or on a read-only page, the word.
 */
function AnsweredCell({ call, day, editable, onEdit }: { call: ListedCall; day: string; editable: boolean; onEdit: () => void }) {
  const [pending, setPending] = usePending<boolean | null>(call);
  const shown: ListedCall = pending === undefined ? call : { ...call, answered: pending, answeredSet: pending !== call.sourceAnswered };
  const label = answeredLabel(shown);
  const quiet = shown.answered === true ? "" : " people-table__secondary";
  if (!editable) return <td className={`calls-table__answered${quiet}`} title={answeredHint(shown)}>{label}</td>;
  const save = (answer: CallAnswer) => {
    if (answer === callAnswer(shown.answered)) return;
    onEdit();
    setPending(answer === "unknown" ? null : answer === "answered", async () => (await change(() => saveCallAnswered(call.ref, day, answer))) !== undefined);
  };
  return (
    // Its keys are the select's (the arrows pick), not the row's.
    <td className="calls-table__answered" onClick={keepFromRow} onKeyDown={(event) => event.stopPropagation()}>
      <select
        className={`calls-table__answer${shown.answered === true ? "" : " calls-table__answer--quiet"}${shown.answeredSet ? " calls-table__answer--set" : ""}`}
        aria-label="Answered"
        title={answeredHint(shown)}
        value={callAnswer(shown.answered)}
        onChange={(event) => save(event.target.value as CallAnswer)}
      >
        <option value="answered">Yes</option>
        <option value="missed">No</option>
        <option value="unknown" aria-label="Not known"></option>
      </select>
    </td>
  );
}

/**
 * A call's length: "25 min", with a pencil when you entered it yourself (given or logged; as its source says, it has no
 * mark, its tooltip saying whose it is), or "unknown"; a missed call has none.
 * Where it can be set, a button that opens a box: minutes (25) or hours and minutes (1:30); empty takes a call
 * record's own length away.
 */
function LengthCell({ call, day, editable, onEdit }: { call: ListedCall; day: string; editable: boolean; onEdit: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = usePending<number | null>(call);
  // Just typed, it is yours (a call record's, or one logged), until the row loads again.
  const shown: ListedCall = pending === undefined ? call
    : pending === null ? { ...call, durationSeconds: null, answered: null, length: null }
    : { ...call, durationSeconds: pending * 60, answered: true, length: call.length === "logged" ? "logged" : "given" };
  const seconds = shown.durationSeconds;
  const label = lengthLabel(shown);
  const byHand = label !== null && lengthByHand(shown);
  const text = (
    <>
      {label ?? (shown.answered === false ? <span className="people-table__secondary">—</span> : <span className="people-table__none">unknown</span>)}
      {byHand && <ByHand />}
    </>
  );
  if (!editable) return <td title={lengthHint(shown)}>{text}</td>;
  const save = (minutes: number | null) => {
    setEditing(false);
    if (minutes === (seconds === null ? null : Math.round(seconds / 60))) return;
    onEdit();
    setPending(minutes, async () => {
      if (call.ref.kind === "record") {
        const before = { callSeconds: call.durationSeconds, callLengthGiven: call.length === "given" };
        return (await change(() => saveCallLength(call.ref.id, day, before, minutes))) !== undefined;
      }
      // A logged call's whole group, as Add event's Call changes it, with only its length new.
      try {
        const input = callInput({ ...callDraftOf(await archiveApi.loggedCall(call.ref.id)), length: callLengthText(minutes!) });
        return input !== null && (await saveCall(input, call.ref.id));
      } catch (error) {
        reportError(error);
        return false;
      }
    });
  };
  return (
    <td className="people-table__location" onClick={keepFromRow} onKeyDown={moveUpOrDown}>
      {editing ? (
        <CellBox
          start={seconds === null ? "" : callLengthText(Math.round(seconds / 60))}
          label="How long it lasted: minutes, or h:mm"
          placeholder="25, 1:30"
          numeric
          check={(typed) => {
            if (typed.trim() === "") return call.ref.kind === "record" ? { value: null } : null;
            const minutes = parseCallLength(typed);
            return minutes === null || minutes > CALL_LENGTH_MOST_MINUTES ? null : { value: minutes };
          }}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button type="button" className="people-table__cell-button" title={byHand ? `${lengthHint(shown)}: click to change it` : lengthHint(shown)} onClick={() => setEditing(true)}>
          {seconds === null ? <span className="calls-table__add-length">Add length</span> : text}
        </button>
      )}
    </td>
  );
}

/** The pencil after a length you entered yourself, read out as "logged by hand". */
function ByHand() {
  return (
    <span className="calls-table__by-hand" role="img" aria-label="logged by hand">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z M9.5 4 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** A call's note: its first line (all of it on pointing), "hidden" with the names; where it can be changed, a button that opens a box. */
function NoteCell({ call, day, editable, hidden, onEdit }: { call: ListedCall; day: string; editable: boolean; hidden: boolean; onEdit: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = usePending<string>(call);
  const note = pending ?? call.note;
  if (hidden) return <td>{note && <span className="people-table__none">hidden</span>}</td>;
  if (!editable) return <td title={note || undefined}>{note.split("\n")[0]}</td>;
  const save = (next: string) => {
    setEditing(false);
    if (next === note) return;
    onEdit();
    setPending(next, async () => (await change(() => saveCallNote(call.ref, day, call.note, next))) !== undefined);
  };
  return (
    <td className="people-table__location" onClick={keepFromRow} onKeyDown={moveUpOrDown}>
      {editing ? (
        <CellBox start={note} label="Note" placeholder="What you talked about" check={(typed) => ({ value: typed.trim() })} onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        <button type="button" className="people-table__cell-button" title={note || "Add a note"} onClick={() => setEditing(true)}>
          {note ? note.split("\n")[0] : <span className="people-table__add">Add</span>}
        </button>
      )}
    </td>
  );
}

/**
 * The box a cell opens in its place, holding `start`: Enter or leaving it saves what `check` makes of what is typed
 * (nothing while it makes nothing of it), Escape does not. After Enter or Escape, focus goes back to the cell's
 * button, so the arrow keys go on from there.
 */
function CellBox<T>({ start, label, placeholder, numeric, check, onSave, onCancel }: {
  start: string;
  label: string;
  placeholder: string;
  numeric?: boolean;
  check: (typed: string) => { value: T } | null;
  onSave: (value: T) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState(start);
  const box = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => box.current?.select(), []);
  const valid = check(typed);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && valid) onSave(valid.value);
    else onCancel();
  };
  return (
    <input
      ref={box}
      className="people-table__location-box"
      aria-label={label}
      aria-invalid={valid === null}
      placeholder={placeholder}
      inputMode={numeric ? "numeric" : undefined}
      value={typed}
      autoFocus
      onChange={(event) => setTyped(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter" && event.key !== "Escape") return;
        const cell = event.currentTarget.closest("td");
        finish(event.key === "Enter");
        requestAnimationFrame(() => cell?.querySelector("button")?.focus({ preventScroll: true }));
      }}
    />
  );
}
