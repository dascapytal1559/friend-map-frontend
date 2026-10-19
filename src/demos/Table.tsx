// The Table view's table: one row per person, a column per thing known about
// them, sorted by clicking a column's header (again to turn it round). Only
// the rows in sight are drawn, so tens of thousands of people scroll smoothly.
// With a platform picked, Messages, Direct and Last message say so in their
// headers, and count that platform alone (filterRows in table.ts); with Phone
// calls, which has no messages, Answered calls, Call time and Last call stand in for them.
// Clicking a row (or Enter on it) opens the person panel; arrow keys move
// between rows. Where people can be changed, the Location cell sets where
// they are, in place (LocationCell.tsx), shown
// at once while the save goes. Rows alternate in shade (by their place in the list, so it
// stays right however the rows are sorted or filtered). Every name goes through useNames, so it
// follows the name choice, and No name except… hides notes too.

import { Fragment, type KeyboardEvent, memo, type ReactNode, useEffect, useState } from "react";
import { sameLocation } from "../locations.ts";
import { Identicon } from "../Identicon.tsx";
import { useNames } from "../names.ts";
import { HiddenName, platformName, TagChips } from "../PersonParts.tsx";
import { callDuration } from "../calls.ts";
import { dayKey, relativeDay, timeOfDay } from "../time.ts";
import { UNTOUCHED_HINT } from "../untouched.ts";
import { scoreLabel } from "./closeness.ts";
import type { TablePerson } from "../archive.ts";
import { LocationCell } from "./LocationCell.tsx";
import { CALL_PLATFORM, type Column, type TableSort } from "./table.ts";
import "./table.css";
import { number, useSize } from "./view.tsx";

/** Every row is this tall, so the rows in sight follow from the scroll position alone. */
const ROW = 34;
/** Rows drawn beyond each edge of the scroller, so a quick scroll shows no gap. */
const OVERSCAN = 12;

export interface TableColumn {
  column: Column;
  title: string;
  width: number;
  hint?: string;
  numeric?: boolean;
}

const COLUMNS: TableColumn[] = [
  { column: "name", title: "Name", width: 220 },
  { column: "tags", title: "Tags", width: 170 },
  { column: "location", title: "Location", width: 110 },
  { column: "platforms", title: "Platforms", width: 150 },
  { column: "messages", title: "Messages", width: 100, numeric: true, hint: "One-to-one messages both ways, and what they sent in group chats" },
  { column: "direct", title: "Direct", width: 90, numeric: true, hint: "One-to-one messages both ways only, no group chats" },
  {
    column: "closeness",
    title: "Closeness",
    width: 120,
    numeric: true,
    hint: "The closeness score Orbits places people by, and the rank among the people shown here",
  },
  { column: "last", title: "Last message", width: 130 },
  { column: "firstContact", title: "First contact", width: 120, hint: "Their first message, call or hangout with you, on any platform" },
  { column: "added", title: "Added", width: 110, hint: "When they were added to the archive, by an import or by you" },
  { column: "note", title: "Note", width: 260 },
];

/** The columns that count one platform alone when one is picked. */
const BY_PLATFORM: ReadonlySet<Column> = new Set(["messages", "direct", "last"]);
/** Room each of those gains for the platform's name in its header. */
const PLATFORM_ROOM = 80;

/** With Phone calls picked, in place of Messages, Direct and Last message, in that order. */
const CALL_COLUMNS: TableColumn[] = [
  { column: "calls", title: "Answered calls", width: 130, numeric: true, hint: "Phone and FaceTime calls that were answered (and how many were not, on the number)" },
  { column: "callTime", title: "Call time", width: 110, numeric: true, hint: "How long the answered calls were connected, in all" },
  { column: "lastCall", title: "Last call", width: 130, hint: "When the newest call was, answered or not" },
];

/** A platform as the Table names it: the call history's is "Phone calls", the rest as everywhere else. */
export function tablePlatformName(platform: string): string {
  return platform === CALL_PLATFORM ? "Phone calls" : platformName(platform);
}

/**
 * The columns, with `platform`'s name (when one is picked) in the headers that count it alone; with Phone calls,
 * the call columns in place of the message columns, which it has nothing in.
 */
export function columnsFor(platform: string | null): TableColumn[] {
  const columns = COLUMNS;
  if (!platform) return columns;
  if (platform === CALL_PLATFORM) {
    const calls = CALL_COLUMNS.values();
    return columns.flatMap((c) => (BY_PLATFORM.has(c.column) ? [calls.next().value!] : [c]));
  }
  const name = tablePlatformName(platform);
  return columns.map((c) =>
    BY_PLATFORM.has(c.column)
      ? { ...c, title: `${c.title} · ${name}`, width: c.width + PLATFORM_ROOM, hint: `${c.hint ?? c.title}, on ${name} only` }
      : c,
  );
}

/** What the rows need to change where people are; none where nothing can be changed (demo mode). */
export interface LocationEdit {
  /** The values in use, the most used first. */
  values: readonly string[];
  /** Saves it; resolves false when it was not saved. The same object while nothing in it changes, so rows are not drawn again. */
  onLocation: (id: number, location: string | null) => Promise<boolean>;
}

/** `top` is the header's height (without its padding): the table starts under it. */
export function PeopleTable({ rows, ranks, sort, onSort, openId, onOpen, now, top: offset, columns, edit }: {
  rows: TablePerson[];
  /** Rank by closeness among the people shown (see filterRows). */
  ranks: Map<number, number>;
  sort: TableSort;
  onSort: (column: Column) => void;
  openId: number | null;
  onOpen: (id: number) => void;
  now: number;
  top: number;
  /** The columns to show (columnsFor the platform picked); the same array while the platform is, so rows are not drawn again. */
  columns: readonly TableColumn[];
  edit?: LocationEdit;
}) {
  const [scrollerRef, size] = useSize<HTMLDivElement>();
  const [top, setTop] = useState(0);
  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((top + size.height) / ROW) + OVERSCAN);

  return (
    <div className="people-table" style={{ top: offset + 24 }} ref={scrollerRef} onScroll={(event) => setTop(event.currentTarget.scrollTop)}>
      <table style={{ width: columns.reduce((sum, c) => sum + c.width, 0) }} aria-rowcount={rows.length + 1}>
        <colgroup>
          {columns.map((c) => <col key={c.column} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            {columns.map((c) => (
              <th
                key={c.column}
                scope="col"
                className={c.numeric ? "people-table__numeric" : undefined}
                aria-sort={sort.column === c.column ? (sort.descending ? "descending" : "ascending") : undefined}
              >
                <button type="button" title={c.hint} onClick={() => onSort(c.column)}>
                  {c.title}
                  <span className="people-table__arrow" aria-hidden>{sort.column === c.column ? (sort.descending ? "↓" : "↑") : ""}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {first > 0 && <tr aria-hidden style={{ height: first * ROW }} />}
          {rows.slice(first, last).map((row, i) => (
            <PersonRow
              key={row.id}
              row={row}
              rank={ranks.get(row.id) ?? 0}
              index={first + i}
              columns={columns}
              open={row.id === openId}
              onOpen={onOpen}
              now={now}
              edit={edit}
            />
          ))}
          {last < rows.length && <tr aria-hidden style={{ height: (rows.length - last) * ROW }} />}
        </tbody>
      </table>
      {rows.length === 0 && <p className="people-table__empty">Nobody here.</p>}
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

/** An instant as its local day and time, for a date cell's tooltip. */
const moment = (ms: number) => `${dayKey(ms)} ${timeOfDay(ms)}`;

/** Drawn again only when its own props change, so a change to one person redraws just their row. */
export const PersonRow = memo(function PersonRow({ row, rank, index, columns, open, onOpen, now, edit }: {
  row: TablePerson;
  rank: number;
  index: number;
  columns: readonly TableColumn[];
  open: boolean;
  onOpen: (id: number) => void;
  now: number;
  edit?: LocationEdit;
}) {
  const names = useNames();
  // A location just set shows at once, until the row is loaded again after it is saved (or the save fails); an undo
  // straight after it then shows too.
  const [pending, setPending] = useState<{ location: string | null; saved: boolean } | null>(null);
  const location = pending ? pending.location : row.location;
  useEffect(() => setPending((last) => (last?.saved ? null : last)), [row]);
  const setLocation = (next: string | null) => {
    if (!edit || next === location || (next !== null && location !== null && sameLocation(next, location))) return;
    const mine = { location: next, saved: false };
    setPending(mine);
    void edit.onLocation(row.id, next).then((saved) =>
      setPending((last) => (last !== mine ? last : saved ? { ...mine, saved: true } : null)));
  };
  const { primary, secondary } = names.label(row);
  const platforms = row.platforms.map(tablePlatformName).join(", ");
  const none = (text: string) => <span className="people-table__none">{text}</span>;
  const cell = (column: Column): ReactNode => {
    switch (column) {
      case "name": return (
        <td title={row.untouched ? (secondary ? `${secondary}. ${UNTOUCHED_HINT}` : UNTOUCHED_HINT) : secondary ?? undefined} className={row.untouched ? "people-table__untouched" : undefined}>
          <Identicon seed={row.identiconSeed} hue={row.identiconHue} size={16} className="people-table__identicon" />
          {primary.trim() ? primary : names.hidden ? <HiddenName /> : none("No name")}
          {secondary && <span className="people-table__secondary"> {secondary}</span>}
        </td>
      );
      case "tags": return <td><TagChips tags={row.tags} /></td>;
      case "location": return edit
        ? <LocationCell location={location} values={edit.values} onSave={setLocation} />
        : <td title={row.location ?? undefined}>{row.location}</td>;
      case "platforms": return <td title={platforms || undefined}>{platforms || none("none")}</td>;
      case "messages": return (
        <td
          className="people-table__numeric"
          title={`${number(row.directMessageCount)} one-to-one · ${number(row.groupMessageCount)} theirs in group chats`}
        >
          {number(row.messageCount)}
        </td>
      );
      case "direct": return <td className="people-table__numeric">{number(row.directMessageCount)}</td>;
      case "closeness": return (
        <td className="people-table__numeric">
          {row.closeness > 0 ? scoreLabel(row.closeness) : none("0")}
          {rank > 0 && <span className="people-table__rank"> #{number(rank)}</span>}
        </td>
      );
      case "last": return <td>{row.lastMessageAt === null ? none("never") : relativeDay(row.lastMessageAt, now)}</td>;
      case "firstContact": return <td title={row.firstContactAt === null ? undefined : moment(row.firstContactAt)}>{row.firstContactAt === null ? none("never") : dayKey(row.firstContactAt)}</td>;
      case "added": return <td title={moment(row.addedAt)}>{dayKey(row.addedAt)}</td>;
      case "note": return (
        <td title={names.hidden ? undefined : row.note || undefined}>
          {row.note && (names.hidden ? none("hidden") : row.note)}
        </td>
      );
      case "calls": return (
        <td className="people-table__numeric" title={row.calls ? `${number(row.calls.answered)} answered · ${number(row.calls.unanswered)} not answered` : undefined}>
          {number(row.calls?.answered ?? 0)}
        </td>
      );
      case "callTime": return <td className="people-table__numeric">{row.calls?.seconds ? callDuration(row.calls.seconds) : none("none")}</td>;
      case "lastCall": return <td>{row.calls ? relativeDay(row.calls.lastCallAt, now) : none("never")}</td>;
    }
  };
  return (
    <tr
      aria-rowindex={index + 2}
      aria-selected={open}
      className={`${index % 2 ? "people-table__odd" : ""}${open ? " people-table__open" : ""}`.trim() || undefined}
      tabIndex={0}
      style={{ height: ROW }}
      onClick={() => onOpen(row.id)}
      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Enter" && event.target === event.currentTarget) onOpen(row.id);
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") focusRow(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
        else return;
        event.preventDefault();
      }}
    >
      {columns.map((c) => <Fragment key={c.column}>{cell(c.column)}</Fragment>)}
    </tr>
  );
});
