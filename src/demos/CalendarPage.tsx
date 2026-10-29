// The Calendar view, at /calendar: every communication by day. A month of
// local days, Monday first (filled out, muted, with the days either side,
// their counts and marks too), each shaded by how many messages it had (on a
// log scale, the month's busiest day the strongest) and marked with its
// hangouts (catch-ups) and calls; a click (or Enter, the arrow keys moving between days
// and months) opens the day panel (DayPanel.tsx) docked beside it: the day's
// totals, hangouts, calls and chats, and its messages. Whoever a chat is with
// opens their person panel in the dock, with a back arrow to the day.
//
// One-to-one chats only, until Messages "With groups" in the Calendar's
// settings in the menu (viewSettings.ts) adds group chats, to the calendar's
// counts and shading too (remembered in this browser; calendar.ts). The header has a Hide of its own (its choices kept
// apart from the map's and the Table's), Name format (the name choice) and People; the h key hides names. The month and the open day are kept in the address
// (?month=2026-10, ?day=2026-10-04), so a reload stays where it was. Reads
// GET /api/archive/calendar/:month and :day, and a chat's day from the content
// path, through archiveApi, so a backend of made-up people (the demo backend) draws its days.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import "../app.css";
import type { CalendarMonth } from "../archive.ts";
import { archiveApi } from "../archiveApi.ts";
import { callDuration } from "../calls.ts";
import { hoursLabel } from "../catchUps.ts";
import { PeoplePanel } from "../PeoplePanel.tsx";
import { addDays, addMonths, dayKey } from "../time.ts";
import { useShownNames } from "../shownNames.ts";
import { followArchive, useArchive } from "../useArchive.ts";
import { useUsage } from "../usage.ts";
import { ViewSwitcher, type Navigate } from "../ViewSwitcher.tsx";
import { fromAddress, heat, MONTH_NAMES, monthGrid, monthHangouts, monthTitle, monthTotals, neighbourMonths, neighbourTotals, shiftMonth, shortDay, sumTotals, toAddress, useIncludeGroups, WEEKDAYS, type DayTotals } from "./calendar.ts";
import "./calendar.css";
import { DayPanel } from "./DayPanel.tsx";
import "./demos.css";
import { HidePanel, useHideChoices } from "./HidePanel.tsx";
import { HANGOUT, hangoutCount } from "../eventWords.ts";
import { hideEntries } from "./hideChoices.ts";
import { ChangeChip, Dock, ErrorNotice, useHideNamesKey, useSidePanel } from "./page.tsx";
import { number, useSize } from "./view.tsx";

/**
 * What the dock holds: a day; or, with `person`, a person's panel (or People, for null) in its place, opened from that
 * day or (with no day) from the header.
 */
type CalendarPanel = { day: string | null; person?: number | null };

export function CalendarPage({ navigate }: { navigate: Navigate }) {
  const today = dayKey(Date.now());
  const initial = useMemo(() => fromAddress(window.location.search, today), []);
  const [month, setMonth] = useState(initial.month);
  const [hide, setHide] = useHideChoices("calendar");
  const groups = useIncludeGroups();
  const [headerRef, header] = useSize<HTMLElement>();
  const { panel, setPanel, shown, closed } = useSidePanel<CalendarPanel>(true);
  useUsage("calendar");
  useHideNamesKey(true);
  useShownNames(true);
  useEffect(() => followArchive(), []);
  useEffect(() => {
    if (initial.day) setPanel({ day: initial.day });
  }, []);
  // The address says where the calendar is, so a reload stays there.
  const day = panel?.day ?? null;
  useEffect(() => {
    const search = toAddress(month, day, today);
    if (window.location.search !== search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}`);
  }, [month, day]);

  const loaded = useArchive(() => archiveApi.calendarMonth(month), [month], { messages: true });
  const data = loaded.data?.month === month ? loaded.data : undefined;
  // Every tag, in order, for Hide.
  const tags = useArchive(() => archiveApi.tags(), []);
  const entries = useMemo(() => hideEntries(data?.people ?? [], tags.data?.map((t) => t.name) ?? []), [data, tags.data]);
  const totals = useMemo(() => (data ? monthTotals(data, hide, groups) : new Map<string, DayTotals>()), [data, hide, groups]);
  // The months either side, for the days of theirs the grid fills out with.
  const spills = neighbourMonths(month);
  const [before, after] = [addMonths(month, -1), addMonths(month, 1)];
  const beforeLoaded = useArchive(() => archiveApi.calendarMonth(before), [before], { messages: true, enabled: spills.includes(before) });
  const afterLoaded = useArchive(() => archiveApi.calendarMonth(after), [after], { messages: true, enabled: spills.includes(after) });
  const around = useMemo(
    () => neighbourTotals(month, [beforeLoaded.data, afterLoaded.data].filter((m) => m !== undefined), hide, groups),
    [month, beforeLoaded.data, afterLoaded.data, hide, groups],
  );

  const openDay = (next: string) => {
    setMonth(next.slice(0, 7));
    setPanel({ day: next });
  };
  const openPerson = (person: number | null) => setPanel({ day: panel?.day ?? null, person });
  const status = data ? null : loaded.unavailable ? "The message archive is not running, so there are no days to show." : loaded.error;

  return (
    <div className={`demos${panel ? " demos--docked" : ""}`}>
      <div className="demos__map">
        <div className="demos__stage">
          <div className="calendar" style={{ top: header.height + 10 }}>
            <MonthNav month={month} today={today} span={data?.span} onMonth={setMonth} />
            <MonthSummary data={data} totals={totals} hangouts={data ? monthHangouts(data, hide) : 0} groups={groups} />
            <MonthView month={month} today={today} totals={totals} around={around} open={day} onOpen={openDay} onMonth={setMonth} />
            <CalendarKey groups={groups} />
            {status && <p className="calendar__status">{status}</p>}
          </div>
        </div>
        <header className="demos__header" ref={headerRef}>
          <ViewSwitcher current="calendar" crumb="Friend map" navigate={navigate} names />
          <div className="demos__controls">
            <HidePanel entries={entries} choices={hide} onChange={setHide} />
            <button type="button" className="demos__people" onClick={() => setPanel(panel?.person === null ? null : { day: panel?.day ?? null, person: null })}>
              People
            </button>
          </div>
        </header>
        <ErrorNotice />
        <ChangeChip />
      </div>
      <Dock open={panel !== null} onClosed={closed}>
        {shown?.day && (
          <DayPanel
            className="demos__docked"
            day={shown.day}
            hide={hide}
            groups={groups}
            onStep={(by) => openDay(addDays(shown.day!, by))}
            onOpenPerson={openPerson}
            onClose={() => setPanel(null)}
            hidden={shown.person !== undefined}
          />
        )}
        {shown && shown.person !== undefined && (
          <PeoplePanel
            className="demos__docked"
            openId={shown.person}
            onOpen={openPerson}
            onClose={() => setPanel(null)}
            back={shown.day ? { label: shortDay(shown.day), onBack: () => setPanel({ day: shown.day! }) } : undefined}
          />
        )}
      </Dock>
    </div>
  );
}

/** The month shown, the months either side, any month by name and year, and today's. */
export function MonthNav({ month, today, span, onMonth }: {
  month: string;
  today: string;
  span?: CalendarMonth["span"];
  onMonth: (month: string) => void;
}) {
  const [year, m] = month.split("-").map(Number);
  // From the first year with anything to this year (or the last with anything), and the year shown.
  const first = Math.min(year, Number((span?.first ?? today).slice(0, 4)));
  const last = Math.max(year, Number(today.slice(0, 4)), Number((span?.last ?? today).slice(0, 4)));
  const years = Array.from({ length: last - first + 1 }, (_, i) => last - i);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="calendar__nav">
      <button type="button" className="calendar__step" aria-label="The month before" title="The month before" onClick={() => onMonth(addMonths(month, -1))}>‹</button>
      <h2 className="calendar__title">
        <select aria-label="Month" value={m} onChange={(event) => onMonth(`${year}-${pad(Number(event.target.value))}`)}>
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select aria-label="Year" value={year} onChange={(event) => onMonth(`${event.target.value}-${pad(m)}`)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </h2>
      <button type="button" className="calendar__step" aria-label="The month after" title="The month after" onClick={() => onMonth(addMonths(month, 1))}>›</button>
      <button type="button" className="demos__method calendar__today" disabled={month === today.slice(0, 7)} onClick={() => onMonth(today.slice(0, 7))}>
        Today
      </button>
    </div>
  );
}

/** The month added up: its messages, calls and hangouts (`hangouts` of them, a trip once), as Hide and the group choice leave them. */
function MonthSummary({ data, totals, hangouts, groups }: { data?: CalendarMonth; totals: Map<string, DayTotals>; hangouts: number; groups: boolean }) {
  if (!data) return <p className="calendar__summary">Loading…</p>;
  const sum = sumTotals(totals.values());
  const parts = [
    `${number(sum.messages)} ${groups ? "" : "one-to-one "}${sum.messages === 1 ? "message" : "messages"}`,
    ...(sum.calls > 0 ? [`${number(sum.calls)} ${sum.calls === 1 ? "call" : "calls"}${sum.callSeconds > 0 ? ` (${callDuration(sum.callSeconds)})` : ""}`] : []),
    ...(hangouts > 0 ? [`${hangoutCount(hangouts)} (${hoursLabel(Math.round(sum.catchUpHours * 100) / 100)})`] : []),
  ];
  return <p className="calendar__summary">{parts.join(" · ")}</p>;
}

/**
 * The month's days, a week a row: each shaded by its messages and marked with its catch-ups and calls; the days of the
 * months either side that fill out its first and last weeks are muted and unshaded, with their counts and marks. The
 * arrow keys move between days (into the month either side), Page Up and Page Down by months.
 */
export function MonthView({ month, today, totals, around = new Map(), open, onOpen, onMonth }: {
  month: string;
  today: string;
  totals: ReadonlyMap<string, DayTotals>;
  /** The totals of the days shown from the months either side. */
  around?: ReadonlyMap<string, DayTotals>;
  /** The day open in the panel, if any. */
  open: string | null;
  onOpen: (day: string) => void;
  onMonth: (month: string) => void;
}) {
  const weeks = monthGrid(month);
  const busiest = Math.max(0, ...[...totals.values()].map((t) => t.messages));
  const grid = useRef<HTMLDivElement>(null);
  // The day the keyboard is on: the open day, or today, or the 1st.
  const [focus, setFocus] = useState<string | null>(null);
  const inMonth = (day: string | null) => day !== null && day.startsWith(month);
  const current = inMonth(focus) ? focus! : inMonth(open) ? open! : inMonth(today) ? today : `${month}-01`;
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${current}"]`)?.focus();
  }, [current, month]);

  const onKey = (event: KeyboardEvent, day: string) => {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    const months = { PageUp: -1, PageDown: 1 }[event.key];
    if (by === undefined && months === undefined) return;
    event.preventDefault();
    const next = by !== undefined ? addDays(day, by) : shiftMonth(day, months!);
    moved.current = true;
    setFocus(next);
    if (!next.startsWith(month)) onMonth(next.slice(0, 7));
  };

  return (
    <div className="calendar__month" ref={grid} role="group" aria-label={monthTitle(month)} style={{ "--weeks": weeks.length } as CSSProperties}>
      {WEEKDAYS.map((name) => <span key={name} className="calendar__weekday" aria-hidden>{name}</span>)}
      {weeks.flat().map((day) => (
        <DayCell
          key={day}
          day={day}
          totals={inMonth(day) ? totals.get(day) : around.get(day)}
          busiest={busiest}
          outside={!inMonth(day)}
          today={day === today}
          future={day > today}
          open={day === open}
          tabbable={day === current}
          onOpen={() => {
            setFocus(day);
            onOpen(day);
          }}
          onKey={(event) => onKey(event, day)}
        />
      ))}
    </div>
  );
}

function DayCell({ day, totals, busiest, outside, today, future, open, tabbable, onOpen, onKey }: {
  day: string;
  totals?: DayTotals;
  busiest: number;
  /** In the month before or after: muted, and unshaded, the month shown setting the shades. */
  outside: boolean;
  today: boolean;
  future: boolean;
  open: boolean;
  tabbable: boolean;
  onOpen: () => void;
  onKey: (event: KeyboardEvent) => void;
}) {
  const t = totals;
  const shade = outside ? 0 : heat(t?.messages ?? 0, busiest);
  const answered = t ? t.calls - t.missed : 0;
  const className = ["calendar__day", outside && "calendar__day--outside", today && "calendar__day--today", future && "calendar__day--future", open && "calendar__day--open"].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={className}
      data-day={day}
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={open}
      aria-label={dayLabel(day, t, today)}
      style={{ "--heat": shade.toFixed(3) } as CSSProperties}
      onClick={onOpen}
      onKeyDown={onKey}
    >
      <span className="calendar__date">{Number(day.slice(8))}</span>
      {t && t.messages > 0 && <span className="calendar__count">{compact(t.messages)}</span>}
      <span className="calendar__marks" aria-hidden>
        {t && t.catchUps > 0 && <span className="calendar__mark calendar__mark--catch-up">{t.catchUps > 1 ? t.catchUps : ""}</span>}
        {answered > 0 && <span className="calendar__mark calendar__mark--call">{answered > 1 ? answered : ""}</span>}
        {t && t.missed > 0 && <span className="calendar__mark calendar__mark--missed">{t.missed > 1 ? t.missed : ""}</span>}
      </span>
    </button>
  );
}

/** "Saturday 4 October 2026, today: 128 messages in 9 chats, 2 calls, 1 hangout", for a screen reader. */
export function dayLabel(day: string, t: DayTotals | undefined, today = false): string {
  const [year, month, date] = day.split("-").map(Number);
  const name = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const plural = (n: number, one: string) => `${number(n)} ${one}${n === 1 ? "" : "s"}`;
  const parts = t ? [
    ...(t.messages > 0 ? [`${plural(t.messages, "message")} in ${plural(t.chats, "chat")}`] : []),
    ...(t.calls > 0 ? [plural(t.calls, "call") + (t.missed > 0 ? ` (${number(t.missed)} missed)` : "")] : []),
    ...(t.catchUps > 0 ? [hangoutCount(t.catchUps)] : []),
  ] : [];
  return `${name}${today ? ", today" : ""}: ${parts.length > 0 ? parts.join(", ") : "nothing"}`;
}

/** 1234 as "1.2k": a day's count in its corner. */
function compact(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/** What the shade and the marks mean. */
function CalendarKey({ groups }: { groups: boolean }) {
  return (
    <p className="calendar__key">
      <span><span className="calendar__swatch" aria-hidden /> {groups ? "Messages, one-to-one and in groups" : "One-to-one messages"}: the busiest day of the month the strongest</span>
      <span><span className="calendar__mark calendar__mark--catch-up" aria-hidden /> {HANGOUT.One}</span>
      <span><span className="calendar__mark calendar__mark--call" aria-hidden /> Call</span>
      <span><span className="calendar__mark calendar__mark--missed" aria-hidden /> Missed call</span>
    </p>
  );
}
