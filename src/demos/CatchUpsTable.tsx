// The Table's Hangouts (TablePage.tsx, with "Hangouts" picked at the top of
// its header; catch-ups in the code, the word from eventWords.ts): one row per catch-up (src/catchUps.ts), the newest first to
// start with: its date (and time, when it has one; it opens the Calendar at that day, WhenCell.tsx), or a trip's first
// to last day (the first opens), hours (a trip's time together in all, over how
// many days under them), who was there (a chip each, which opens their panel on their chat at the hangout, outlined
// there, then "+20 others" for those not named), what it was worth to each of
// them toward closeness, its Weight each (its hours times the hour's worth, times each one's share
// of it with everyone there, the unnamed others too, catchUpWorth and groupShare), its
// note, and Edit and Delete. Edit opens Add event's form, on Hangout, in
// the row (CatchUps.tsx); a change or a delete shows the change chip, whose
// Undo takes it back. Date, Hours and Weight each sort by a click on their header (again to
// turn it round). Rows of whoever's panel is open are marked. Catch-ups are
// few beside people, so every row is drawn, each as tall as it needs. Names
// go through useNames and notes hide with them; a read-only page (demo mode)
// shows no Edit or Delete.

import { Fragment } from "react";
import type { CatchUp } from "../archive.ts";
import { catchUpCountedHours, catchUpDayCount, catchUpTitle, catchUpWhen, catchUpWorth, daysLabel, groupShare, hoursLabel, othersLabel, timeLabel } from "../catchUps.ts";
import { EventForm } from "../CatchUps.tsx";
import { catchUpMoment, type ChatMoment } from "../chatDays.ts";
import { HANGOUT } from "../eventWords.ts";
import { deleteCatchUp } from "../changeChip.ts";
import { useNames } from "../names.ts";
import { change, Name } from "../PersonParts.tsx";
import { useReadOnly } from "../readOnly.ts";
import type { Settings } from "../settings.ts";
import type { CatchUpColumn, CatchUpSort } from "./catchUpsTable.ts";
import "./table.css";
import { number } from "./view.tsx";
import type { Navigate } from "../ViewSwitcher.tsx";
import { WhenCell } from "./WhenCell.tsx";

interface Column {
  key: CatchUpColumn | "who" | "note" | "actions";
  title: string;
  width: number;
  hint?: string;
  numeric?: boolean;
  sorts?: boolean;
}

const COLUMNS: Column[] = [
  { key: "day", title: "Date", width: 170, sorts: true },
  { key: "hours", title: "Hours", width: 110, numeric: true, sorts: true },
  { key: "who", title: "Who", width: 300 },
  {
    key: "weight",
    title: "Weight each",
    width: 90,
    numeric: true,
    sorts: true,
    hint: "What it counts as toward each person's closeness, on its date, in direct messages: its hours times an hour's worth of them, times each one's share with everyone at it, the unnamed others too (half shared by all, half split, by default)",
  },
  { key: "note", title: "Note", width: 260 },
];
const ACTIONS: Column = { key: "actions", title: "", width: 110 };

/** `top` is the header's height (without its padding): the table starts under it. */
export function CatchUpsTable({ rows, sort, onSort, openId, onOpenAt, navigate, editing, onEdit, settings, top }: {
  rows: readonly CatchUp[];
  sort: CatchUpSort;
  onSort: (column: CatchUpColumn) => void;
  openId: number | null;
  /** Opens someone's panel on their chat at a catch-up (a chip in Who). */
  onOpenAt: (id: number, moment: ChatMoment) => void;
  /** For the date, which opens the Calendar. */
  navigate: Navigate;
  /** The catch-up whose row shows the form to change it, if any. */
  editing: number | null;
  onEdit: (id: number | null) => void;
  settings: Pick<Settings, "catchUpHourWorth" | "groupSharedPart" | "tripFullHours">;
  top: number;
}) {
  const readOnly = useReadOnly();
  const columns = readOnly ? COLUMNS : [...COLUMNS, ACTIONS];
  return (
    <div className="people-table catch-ups-table" style={{ top: top + 24 }}>
      <table style={{ width: columns.reduce((sum, c) => sum + c.width, 0) }}>
        <colgroup>
          {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.numeric ? "people-table__numeric" : undefined}
                aria-sort={sort.column === c.key ? (sort.descending ? "descending" : "ascending") : undefined}
              >
                {c.sorts ? (
                  <button type="button" title={c.hint} onClick={() => onSort(c.key as CatchUpColumn)}>
                    {c.title}
                    <span className="people-table__arrow" aria-hidden>{sort.column === c.key ? (sort.descending ? "↓" : "↑") : ""}</span>
                  </button>
                ) : (
                  <span title={c.hint}>{c.title}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((catchUp, i) => (
            <Fragment key={catchUp.id}>
              {editing === catchUp.id ? (
                <tr className="catch-ups-table__editing">
                  <td colSpan={columns.length}>
                    <EventForm start={{ kind: "hangout", id: catchUp.id, hangout: catchUp }} onDone={() => onEdit(null)} />
                  </td>
                </tr>
              ) : (
                <CatchUpRow
                  catchUp={catchUp}
                  index={i}
                  open={openId !== null && catchUp.people.some((p) => p.id === openId)}
                  onOpenAt={onOpenAt}
                  navigate={navigate}
                  onEdit={() => onEdit(catchUp.id)}
                  settings={settings}
                  readOnly={readOnly}
                />
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="people-table__empty">No {HANGOUT.many} here. Add one with Add {HANGOUT.one} above, or Add event in someone's panel.</p>}
    </div>
  );
}

function CatchUpRow({ catchUp, index, open, onOpenAt, navigate, onEdit, settings, readOnly }: {
  catchUp: CatchUp;
  index: number;
  open: boolean;
  onOpenAt: (id: number, moment: ChatMoment) => void;
  navigate: Navigate;
  onEdit: () => void;
  settings: Pick<Settings, "catchUpHourWorth" | "groupSharedPart" | "tripFullHours">;
  readOnly: boolean;
}) {
  const names = useNames();
  // A trip's worth is its days' added up: the hours its time together counts as (tripCountedHours), at the same share.
  const counted = catchUpCountedHours(settings, catchUp);
  const worth = catchUpWorth(settings, counted, catchUp.people.length, catchUp.others);
  const everyone = catchUp.people.length + catchUp.others;
  const days = catchUpDayCount(catchUp);
  return (
    <tr className={`${index % 2 ? "people-table__odd" : ""}${open ? " people-table__open" : ""}`.trim() || undefined}>
      <WhenCell
        when={<>{catchUpWhen(catchUp.day, catchUp.trip?.lastDay)}{catchUp.time && <span className="people-table__secondary"> {timeLabel(catchUp.time)}</span>}</>}
        day={catchUp.day}
        navigate={navigate}
      />
      <td className="people-table__numeric" title={catchUpTitle(catchUp.hours, days)}>
        {number(catchUp.hours)}
        {catchUp.trip && <span className="people-table__secondary catch-ups-table__days">over {daysLabel(days)}</span>}
      </td>
      <td className="catch-ups-table__who">
        {catchUp.people.map((p) => (
          <button key={p.id} type="button" className="tag-chip tag-chip--alias" title={`Open their chat at this ${HANGOUT.one}`} onClick={() => onOpenAt(p.id, catchUpMoment(catchUp))}>
            <Name text={names.label(p).primary} />
          </button>
        ))}
        {catchUp.others > 0 && <span className="people-table__secondary">{othersLabel(catchUp.others)}</span>}
      </td>
      <td
        className="people-table__numeric"
        title={`${hoursLabel(catchUp.hours)}${catchUp.trip && counted !== catchUp.hours ? `, counted as ${hoursLabel(Math.round(counted * 100) / 100)} (the first ${hoursLabel(settings.tripFullHours)} whole, the rest by their square root),` : ""} × ${number(settings.catchUpHourWorth)} messages${everyone > 1 ? ` × ${Math.round(groupShare(settings, everyone) * 100)}%, each one's share with ${everyone} people` : ""}${catchUp.trip ? `, each day's part on its own date` : ""}`}
      >
        {number(Math.round(worth * 10) / 10)}
      </td>
      <td className="catch-ups-table__note" title={names.hidden ? undefined : catchUp.note || undefined}>
        {catchUp.note && (names.hidden ? <span className="people-table__none">hidden</span> : catchUp.note)}
      </td>
      {!readOnly && (
        <td>
          <span className="catch-ups-table__actions">
            <button type="button" className="link-button" onClick={onEdit}>Edit</button>
            <button type="button" className="link-button catch-ups__delete" onClick={() => void change(() => deleteCatchUp(catchUp))}>Delete</button>
          </span>
        </td>
      )}
    </tr>
  );
}
