// The Calendar view's day panel (CalendarPage.tsx docks it): one local
// day's hangouts (catch-ups; a trip on each of its days, with that day's time
// together and which day of it this is), calls (those logged too) and chats, under the day's totals and "Include group
// messages". "Add event" (up to today, and not on a read-only page) opens
// Add event's form on the day, with nobody yet, as the person panel's does.
// Each chat is headed by whoever it is with (a click opens their panel) or by
// the group's name, and its messages that day come a page at a
// time, oldest first, once it scrolls near, so a day of thousands of messages
// opens at once and loads as it is read. What Hide leaves out and how the
// totals add up is calendar.ts's; every name follows the name choice.

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";
import type { CalendarCall, CalendarDay, CalendarDayChat, CalendarPerson, GroupPerson, TimelineMessage } from "../archive.ts";
import { archiveApi } from "../archiveApi.ts";
import { callDuration, callLabel, callPlatformName } from "../calls.ts";
import { catchUpDayCount, catchUpDays, catchUpHoursOn, catchUpWhen, hoursLabel, othersLabel, timeLabel } from "../catchUps.ts";
import { EventForm, newEvent } from "../CatchUps.tsx";
import { HANGOUT } from "../eventWords.ts";
import { reportError } from "../errors.ts";
import { groupName } from "../groupName.ts";
import { Identicon } from "../Identicon.tsx";
import { useNames } from "../names.ts";
import { Name, platformName } from "../PersonParts.tsx";
import { ChatContext, Message } from "../Timeline.tsx";
import { useReadOnly } from "../readOnly.ts";
import { dayKey, zonedFormat } from "../time.ts";
import { useArchive } from "../useArchive.ts";
import { calendarDayTotals, hiddenPeople, longDay, shownWith, type DayTotals } from "./calendar.ts";
import type { HideChoices } from "./hideChoices.ts";
import { number } from "./view.tsx";

/** A chat's messages come this many at a time. */
const PAGE = 100;
/** How far below the panel's view a chat starts loading, in pixels, so it is ready when scrolled to. */
const NEAR = "800px 0px";
const timeFormat = zonedFormat("en-AU", { hour: "numeric", minute: "2-digit" });

/** The panel's scrolling box, which the chats watch to load as they come near. */
const ScrollRoot = createContext<RefObject<HTMLElement | null> | null>(null);

export function DayPanel({ day, hide, groups, onStep, onOpenPerson, onClose, hidden = false, className = "" }: {
  /** YYYY-MM-DD. */
  day: string;
  hide: HideChoices;
  /** Whether group chats are included. */
  groups: boolean;
  /** To the day before (-1) or after (1). */
  onStep: (by: -1 | 1) => void;
  onOpenPerson: (id: number) => void;
  onClose: () => void;
  /** Kept, scrolled where it was, while a person's panel opened from it shows in its place. */
  hidden?: boolean;
  className?: string;
}) {
  const loaded = useArchive(() => archiveApi.calendarDay(day), [day], { messages: true });
  // The day before's answer is not this day's, while this one loads.
  const data = loaded.data?.day === day ? loaded.data : undefined;
  const scroller = useRef<HTMLElement>(null);
  return (
    <aside ref={scroller} className={`side-panel day-panel ${className}`} aria-label={longDay(day)} hidden={hidden}>
      <header className="side-panel__header day-panel__header">
        <button type="button" className="day-panel__step" aria-label="The day before" title="The day before" onClick={() => onStep(-1)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h2>{longDay(day)}</h2>
        <button type="button" className="day-panel__step" aria-label="The day after" title="The day after" onClick={() => onStep(1)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      {data ? (
        <ScrollRoot.Provider value={scroller}>
          <DayContent key={day} data={data} hide={hide} groups={groups} onOpenPerson={onOpenPerson} />
        </ScrollRoot.Provider>
      ) : (
        <p className="muted">{loaded.unavailable ? "The message archive is not running." : (loaded.error ?? "Loading…")}</p>
      )}
    </aside>
  );
}

/** What the day had, as Hide and the Calendar's Messages setting leave it. */
export function DayContent({ data, hide, groups, onOpenPerson }: {
  data: CalendarDay;
  hide: HideChoices;
  groups: boolean;
  onOpenPerson: (id: number) => void;
}) {
  const names = useNames();
  const [adding, setAdding] = useState(false);
  // An event is no later than today.
  const canAdd = !useReadOnly() && data.day <= dayKey(Date.now());
  const hiddenSet = hiddenPeople(data.people, hide);
  const people = new Map(data.people.map((person) => [person.id, person]));
  const totals = calendarDayTotals(data, hiddenSet, groups);
  const catchUps = data.catchUps.filter((catchUp) => shownWith(catchUp.people.map((p) => p.id), hiddenSet));
  // A call with several people (logged, or an app's in no chat) is one row, with everyone on it shown, while anyone is.
  const calls = data.calls.filter((call) => shownWith([call.person], hiddenSet)).reduce<CalendarCall[][]>((rows, call) => {
    const row = call.group === null ? undefined : rows.find((r) => r[0].group === call.group);
    if (row) row.push(call);
    else rows.push([call]);
    return rows;
  }, []);
  const chats = data.chats.filter((chat) => (groups || chat.type === "direct") && shownWith(chat.people, hiddenSet));
  const person = (p: GroupPerson | undefined) => p && <PersonButton person={p} onOpen={onOpenPerson} />;

  return (
    <>
      <DaySummary totals={totals} />
      {/* Whether group messages count is the Calendar's setting, in the menu; here, only what it leaves out. */}
      {!groups && totals.groupMessages > 0 && (
        <p className="day-panel__groups muted" title="Messages: With groups, in the Calendar's settings in the menu at the top left, counts them">
          Not counting {number(totals.groupMessages)} group {totals.groupMessages === 1 ? "message" : "messages"} in {number(totals.groupChats)} {totals.groupChats === 1 ? "group" : "groups"}
        </p>
      )}
      {(catchUps.length > 0 || canAdd) && (
        <section className="day-panel__section">
          <div className="day-panel__section-head">
            <h3>{catchUps.length === 1 ? HANGOUT.One : HANGOUT.Many}</h3>
            {canAdd && !adding && (
              <button type="button" className="link-button day-panel__add" onClick={() => setAdding(true)}>Add event</button>
            )}
          </div>
          {adding && <EventForm start={newEvent(undefined, data.day)} onDone={() => setAdding(false)} />}
          {catchUps.length > 0 && <ul className="day-panel__list">
            {catchUps.map((catchUp) => (
              <li key={catchUp.id} className="day-panel__row">
                <span>
                  {catchUp.time && catchUp.day === data.day && `${timeLabel(catchUp.time)} · `}
                  {catchUp.trip?.lastDay === data.day && `until ${timeLabel(catchUp.trip.endTime)} · `}
                  <strong>{hoursLabel(Math.round(catchUpHoursOn(catchUp, data.day) * 100) / 100)}</strong> with {catchUp.people.map((p, i) => (
                    <span key={p.id}>{i > 0 && (i === catchUp.people.length - 1 ? " and " : ", ")}{person(p)}</span>
                  ))}
                  {catchUp.others > 0 && <span className="muted"> {othersLabel(catchUp.others)}</span>}
                  {catchUp.trip && (
                    <span className="muted">
                      {" "}· day {catchUpDays(catchUp).indexOf(data.day) + 1} of {catchUpDayCount(catchUp)}, {catchUpWhen(catchUp.day, catchUp.trip.lastDay)}, {hoursLabel(catchUp.hours)} in all
                    </span>
                  )}
                </span>
                {catchUp.note && (names.hidden ? <span className="muted">Note hidden</span> : <span className="day-panel__note">{catchUp.note}</span>)}
              </li>
            ))}
          </ul>}
        </section>
      )}
      {calls.length > 0 && (
        <section className="day-panel__section">
          <h3>{calls.length === 1 ? "Call" : "Calls"}</h3>
          <ul className="day-panel__list">
            {calls.map(([call, ...more]) => (
              <li key={`${call.manual ? "logged" : "call"}-${call.id}`} className={`day-panel__row day-panel__call${call.answered ? "" : " day-panel__call--missed"}`}>
                {!call.manual && (more.length > 0 || call.platform !== "phone") ? (
                  // An app's call in no chat: everyone on it shown, its unnamed others counted, all on the one app.
                  <span>
                    <span className="day-panel__time">{timeFormat.format(call.at)}</span> {[call, ...more].map((c, i) => (
                      <span key={c.id}>{i > 0 && (i === more.length ? " and " : ", ")}{person(people.get(c.person))}</span>
                    ))}
                    {call.others > 0 && <span className="muted"> {othersLabel(call.others)}</span>}
                    <span className="muted"> · on {callPlatformName(call.platform)}, {call.direction === "outgoing" ? "you called" : "they called"}</span>
                  </span>
                ) : more.length === 0 ? (
                  <span>
                    <span className="day-panel__time">{timeFormat.format(call.at)}</span> {person(people.get(call.person))}
                    <span className="muted"> · {call.manual ? `on ${callPlatformName(call.platform)}, logged by you` : call.direction === "outgoing" ? "you called" : "they called"}</span>
                  </span>
                ) : (
                  <span>
                    <span className="day-panel__time">{timeFormat.format(call.at)}</span> {[call, ...more].map((c, i) => (
                      <span key={c.id}>{i > 0 && (i === more.length ? " and " : ", ")}{person(people.get(c.person))} <span className="muted">on {callPlatformName(c.platform)}</span></span>
                    ))}
                    <span className="muted"> · logged by you</span>
                  </span>
                )}
                <span>{callLabel(call)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {chats.length > 0 && (
        <section className="day-panel__section">
          <h3>Messages</h3>
          {chats.map((chat) => <DayChat key={chat.id} chat={chat} day={data.day} people={people} onOpenPerson={onOpenPerson} />)}
        </section>
      )}
      {totals.messages + totals.calls + totals.catchUps === 0 && (
        <p className="muted">
          {totals.groupMessages > 0 ? "Nothing here but group messages." : "Nothing on this day."}
        </p>
      )}
    </>
  );
}

/** The day's totals: messages and chats, calls and how long, hangouts and how long. */
export function DaySummary({ totals }: { totals: DayTotals }) {
  const parts: Array<{ key: string; strong: string; rest: string }> = [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (totals.messages > 0) {
    parts.push({ key: "messages", strong: number(totals.messages), rest: ` ${plural(totals.messages, "message", "messages")} in ${number(totals.chats)} ${plural(totals.chats, "chat", "chats")}` });
  }
  if (totals.calls > 0) {
    const answered = totals.calls - totals.missed;
    const detail = [answered > 0 ? callDuration(totals.callSeconds) : "", totals.missed > 0 ? `${number(totals.missed)} missed` : ""].filter(Boolean).join(", ");
    parts.push({ key: "calls", strong: number(totals.calls), rest: ` ${plural(totals.calls, "call", "calls")} · ${detail}` });
  }
  if (totals.catchUps > 0) {
    parts.push({ key: "catch-ups", strong: number(totals.catchUps), rest: ` ${plural(totals.catchUps, HANGOUT.one, HANGOUT.many)} · ${hoursLabel(totals.catchUpHours)}` });
  }
  if (parts.length === 0) return null;
  return (
    <p className="day-panel__totals">
      {parts.map((part) => <span key={part.key}><strong>{part.strong}</strong>{part.rest}</span>)}
    </p>
  );
}

function PersonButton({ person, onOpen }: { person: GroupPerson; onOpen: (id: number) => void }) {
  const names = useNames();
  return (
    <button type="button" className="link-button day-panel__person" onClick={() => onOpen(person.id)}>
      <Name text={names.label(person).primary} />
    </button>
  );
}

/** One chat's day: its heading, then its messages, a page at a time once it comes near. */
function DayChat({ chat, day, people, onOpenPerson }: {
  chat: CalendarDayChat;
  day: string;
  people: ReadonlyMap<number, CalendarPerson>;
  onOpenPerson: (id: number) => void;
}) {
  const names = useNames();
  const root = useContext(ScrollRoot);
  const section = useRef<HTMLElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  /** Where the next page starts; null once all are loaded, undefined before the first. */
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const busy = useRef(false);

  const load = async (after?: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await archiveApi.dayMessages(chat.id, day, { after, limit: PAGE });
      setMessages((shown) => [...shown, ...page.messages]);
      setNext(page.nextAfter);
    } catch (error) {
      reportError(error);
    } finally {
      busy.current = false;
    }
  };
  // Loaded since, all of them, yet more came in (a live chat today): the rest follow the last one shown.
  const last = messages.at(-1);
  const after = next ?? (next === null && last && messages.length < chat.messages ? `${last.sentAt}:${last.id}` : null);

  // The first page once the chat comes near the panel's view, and the next ones as its end does.
  useEffect(() => (near ? undefined : watch(section.current, root?.current, () => setNear(true))), [root, near]);
  useEffect(() => {
    if (near && next === undefined) void load();
  }, [near]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => (after ? watch(more.current, root?.current, () => void loadRef.current(after)) : undefined), [after, root]);

  const person = chat.type === "direct" ? people.get(chat.people[0]) : undefined;
  const shownCount = `${number(chat.messages)} ${chat.messages === 1 ? "message" : "messages"}`;
  const span = chat.first === chat.last ? timeFormat.format(chat.first) : `${timeFormat.format(chat.first)} – ${timeFormat.format(chat.last)}`;
  return (
    <section ref={section} className="day-chat" style={{ minHeight: next === undefined ? Math.min(chat.messages, PAGE) * 40 + 40 : undefined }}>
      <h4 className="day-chat__head">
        {person ? (
          <button type="button" className="day-chat__who" title="Open their panel" onClick={() => onOpenPerson(person.id)}>
            <Identicon seed={person.identiconSeed} hue={person.identiconHue} size={20} />
            <Name text={names.label(person).primary} />
          </button>
        ) : chat.type === "direct" ? (
          <span className="day-chat__who">Notes to yourself</span>
        ) : (
          <span className="day-chat__who day-chat__group"><Name text={groupName({ title: chat.title, people: chat.size, namedBy: chat.namedBy }, names)} /></span>
        )}
        <span className="day-chat__about">
          {platformName(chat.platform)}{chat.type === "group" && ` · ${number(chat.size)} people`} · {shownCount} · {span}
        </span>
      </h4>
      <ChatContext.Provider value={{ inGroup: true }}>
        <div className="day-chat__messages">
          {messages.map((message) => <Message key={message.id} message={message} />)}
        </div>
      </ChatContext.Provider>
      {next === undefined && <p className="muted">Loading…</p>}
      {after && (
        <button ref={more} type="button" className="timeline__more" onClick={() => void load(after)}>
          {number(Math.max(0, chat.messages - messages.length))} more
        </button>
      )}
    </section>
  );
}

/** Calls `onNear` once `element` comes within NEAR of `root`'s view (at once where nothing can watch). Returns a stop. */
function watch(element: Element | null, root: Element | null | undefined, onNear: () => void): (() => void) | undefined {
  if (!element) return undefined;
  if (typeof IntersectionObserver === "undefined") {
    onNear();
    return undefined;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) onNear();
  }, { root: root ?? null, rootMargin: NEAR });
  observer.observe(element);
  return () => observer.disconnect();
}
