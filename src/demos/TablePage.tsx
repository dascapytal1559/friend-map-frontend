// The Table view, at /table: everyone in the archive as a table, archived
// people too (GET /api/archive/table), with the main view's header controls,
// Query bar (its query is remembered apart from the map's) and person panel.
// Its Hide, the last gate after the query, lists every tag, "archive" (everyone
// archived, by you or the automatic rules) and "keep" included, and
// its choices are kept apart from the map's (see hideChoices.ts). Rows are
// ranked by closeness among the people shown, as Orbits ranks its sky.
// The platform picker beside Hide (tablePlatform.ts) lists only people on one
// platform, with their Messages, Direct and Last message there alone (with
// Phone calls, their answered calls, call time and last call instead); the
// query and Hide then apply as ever, and closeness stays over every platform.
// Sorted by a column the platform does not show, it sorts by closeness.
// "Tags" in the header opens the tag manager (TagManager.tsx), where tags are added, renamed,
// deleted and put in order; Hide lists every tag in that order.
// "Add person" (AddPerson.tsx) adds someone you know offline, by hand,
// and opens their panel.
// Each row's Location cell sets where they are in place
// (LocationCell.tsx); from the first, the rows hold their order and who is in
// them (heldRows in table.ts), so nobody jumps away or drops out mid-edit,
// until the sort, the query, Hide, the search, the platform or the name choice
// changes.
// "Changes" opens the change log (ChangesPanel.tsx): every edit to people, hangouts and calls, here
// or from the CLI, who it touched, and Undo. Name format is the name choice, as on
// the map. In the demo (/demo/table, demoMode.ts) the
// rows are the made-up crowd's, the Query bar offers examples, and neither
// Add person, Add hangout, Add call, Tags nor Changes is there, nor the location editing, since nothing can be changed.
//
// Tabs just right of the title (tableRows.ts, in the address) pick what it lists, and the header shows only what
// acts on that list, each tab keeping its own find box's words:
// - People: the count, the find box, Add person and Tags; under them the Query bar, the platform picker and Hide.
// - Hangouts (CatchUpsTable.tsx): every catch-up, the newest first; the count, the find box (by who was there or
//   their note) and Add hangout (AddEvent.tsx). The Query bar, Hide and the platform picker are for people, so they go.
// - Calls (CallsTable.tsx): every call from every source, the newest first, its length and note set in place; the
//   count, the find box (by who was on them or their note) and Add call; under them the Query bar and Hide, which keep
//   the calls with someone they leave in (one query and one Hide with People's), and an app picker in the platform
//   picker's place. Changing a call holds the rows as they are, as setting a location does; Add call lets the rows go
//   so the new call shows.
// Changes (it covers all three) and the People panel's button are on every tab.

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../app.css";
import { appApi } from "../appApi.ts";
import { archiveApi } from "../archiveApi.ts";
import { EXAMPLES } from "../demo/examples.ts";
import { demoMode } from "../demoMode.ts";
import { useNames } from "../names.ts";
import { saveLocation } from "../changeChip.ts";
import type { ChatMoment } from "../chatDays.ts";
import { PeoplePanel } from "../PeoplePanel.tsx";
import { change } from "../PersonParts.tsx";
import { useReadOnly } from "../readOnly.ts";
import { useShownNames } from "../shownNames.ts";
import { followArchive, useArchive } from "../useArchive.ts";
import { useUsage } from "../usage.ts";
import { ViewSwitcher, type Navigate } from "../ViewSwitcher.tsx";
import "./demos.css";
import { ChangeChip, Dock, ErrorNotice, useHideNamesKey, useSidePanel } from "./page.tsx";
import { QueryBar, useQueryBar } from "./QueryBar.tsx";
import { DEFAULT_SORT, filterRows, heldRows, nextSort, platformsIn, sortRows, sortShown, type TableSort } from "./table.ts";
import { useTablePlatform } from "./tablePlatform.ts";
import { TABLE_TABS, useTableRows, type TableRows } from "./tableRows.ts";
import { CATCH_UP_SORT, findCatchUps, nextCatchUpSort, sortCatchUps, type CatchUpSort } from "./catchUpsTable.ts";
import { CatchUpsTable } from "./CatchUpsTable.tsx";
import { appsIn, CALL_SORT, callKey, filterCalls, heldCalls, nextCallSort, sortCalls, type CallSort } from "./callsTable.ts";
import { CallsTable } from "./CallsTable.tsx";
import { AddEvent } from "./AddEvent.tsx";
import type { ListedCall } from "../archive.ts";
import { columnsFor, type LocationEdit, PeopleTable, tablePlatformName } from "./Table.tsx";
import { HidePanel, useHideChoices } from "./HidePanel.tsx";
import { renameHidden, renameStoredHidden } from "./hideChoices.ts";
import { HANGOUT } from "../eventWords.ts";
import { AddPerson } from "./AddPerson.tsx";
import { ChangesPanel } from "./ChangesPanel.tsx";
import { TagManager } from "./TagManager.tsx";
import { number, useSize } from "./view.tsx";

/** No words in any tab's find box. */
const NO_FINDS: Record<TableRows, string> = { people: "", "catch-ups": "", calls: "" };

/** Room under the header for the line under the Query bar's boxes. */
const QUERY_LINE = 22;

export function TablePage({ navigate }: { navigate: Navigate }) {
  const [hide, setHide] = useHideChoices("table");
  // Each tab's find box keeps its own words.
  const [finds, setFinds] = useState(NO_FINDS);
  const queryBar = useQueryBar("table", { hide });
  const { only } = queryBar;
  const [sort, setSort] = useState<TableSort>(DEFAULT_SORT);
  const [listing, setListing] = useTableRows();
  const search = finds.people;
  const catchUpsShown = listing === "catch-ups";
  const callsShown = listing === "calls";
  const [catchUpSort, setCatchUpSort] = useState<CatchUpSort>(CATCH_UP_SORT);
  const [callSort, setCallSort] = useState<CallSort>(CALL_SORT);
  const [pickedApp, setApp] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const names = useNames();
  // What was typed in the search (a name, as often as not) goes once names are hidden.
  useEffect(() => {
    if (names.hidden) setFinds(NO_FINDS);
  }, [names.hidden]);
  const readOnly = useReadOnly();
  // The table starts under the header, however many lines the header wraps to.
  const [headerRef, header] = useSize<HTMLElement>();
  // The panel, and where the person's chat opens when a chip in Who opened it.
  const { panel, setPanel, shown, closed } = useSidePanel<{ person: number | null; moment?: ChatMoment }>(true);
  useUsage("table");
  useHideNamesKey(true);
  useShownNames(!demoMode);
  useEffect(() => followArchive(), []);

  // Closeness is scored at the settings' half-life, as on Orbits.
  const table = useArchive(() => appApi.settings().then((s) => archiveApi.table(s.settings)), []);
  // Every tag, in order (for Hide and the query).
  const tags = useArchive(() => archiveApi.tags(), []);
  const tagKey = JSON.stringify(tags.data?.map((t) => t.name) ?? []);
  const tagNames = useMemo(() => JSON.parse(tagKey) as string[], [tagKey]);
  const people = table.data?.people;
  const platforms = useMemo(() => (people ? platformsIn(people, tablePlatformName) : []), [people]);
  const [picked, setPlatform] = useTablePlatform();
  // A remembered platform nobody is on any more shows everyone.
  const platform = picked && platforms.includes(picked) ? picked : null;
  const columns = useMemo(() => columnsFor(platform), [platform]);
  // Sorted by Messages, then Phone calls picked (or the other way round): by closeness rather than out of sight.
  const shownSort = sortShown(sort, columns.map((c) => c.column));
  // The table waits for the query that ran here last to run again.
  const view = useMemo(
    () => (people && only !== undefined ? filterRows(people, { platform, only, hide, search }, names, tagNames) : null),
    [people, platform, only, hide, search, names, tagNames],
  );
  const byId = useMemo(() => new Map(people?.map((p) => [p.id, p])), [people]);
  const sorted = useMemo(() => (view ? sortRows(view.rows, shownSort, names) : []), [view, shownSort, names]);
  // Setting locations holds the rows as they were (see heldRows) while what chose and sorted them stays the same.
  const basis = JSON.stringify([queryBar.state.applied.query, hide, search, platform, shownSort, names.hidden]);
  const [held, setHeld] = useState<{ basis: string; ids: number[] } | null>(null);
  useEffect(() => setHeld(null), [basis]);
  const rows = useMemo(
    () => (view && held?.basis === basis ? heldRows(held.ids, view.everyone) : sorted),
    [view, held, basis, sorted],
  );
  const holding = useRef({ basis, rows });
  holding.current = { basis, rows };
  // The locations people are at, the most people first, for the Location cell.
  const locations = useArchive(() => archiveApi.locations(), [], { enabled: !readOnly });
  const onLocation = useCallback(async (id: number, location: string | null) => {
    const { basis, rows } = holding.current;
    setHeld((last) => (last?.basis === basis ? last : { basis, ids: rows.map((r) => r.id) }));
    return (await change(() => saveLocation(id, location))) !== undefined;
  }, []);
  const locationValues = locations.data;
  const edit = useMemo<LocationEdit | undefined>(
    () => (readOnly ? undefined : { values: locationValues?.map((v) => v.name) ?? [], onLocation }),
    [readOnly, locationValues, onLocation],
  );
  // A tag renamed in the manager keeps its Hide switch, here and on the map.
  const choices = useRef(hide);
  choices.current = hide;
  const onRenamed = useCallback((from: string, to: string, merged: boolean) => {
    renameStoredHidden(from, to, merged);
    setHide(renameHidden(choices.current, from, to, merged));
  }, [setHide]);
  const onOpen = useCallback((person: number) => setPanel({ person }), [setPanel]);
  // A chip in Who: their chat, at that moment (asked for afresh each time, so the same chip goes back to it).
  const asked = useRef(0);
  const onOpenAt = useCallback((person: number, moment: ChatMoment) => setPanel({ person, moment: { ...moment, asked: ++asked.current } }), [setPanel]);
  // Every catch-up, loaded only once they are listed.
  const catchUps = useArchive(() => archiveApi.catchUps(), [], { enabled: catchUpsShown });
  const catchUpRows = useMemo(
    () => (catchUps.data && table.data ? sortCatchUps(findCatchUps(catchUps.data, finds["catch-ups"], names), catchUpSort, table.data.settings) : null),
    [catchUps.data, finds, names, catchUpSort, table.data],
  );

  // Every call, loaded only once they are listed: those with someone the query and Hide leave in (any platform, the
  // search aside, which finds calls), on the app picked.
  const calls = useArchive(() => archiveApi.listCalls(), [], { enabled: callsShown });
  const callView = useMemo(
    () => (callsShown && people && only !== undefined ? filterRows(people, { platform: null, only, hide, search: "" }, names, tagNames) : null),
    [callsShown, people, only, hide, names, tagNames],
  );
  const apps = useMemo(() => (calls.data ? appsIn(calls.data) : []), [calls.data]);
  // An app picked that no call is on any more lists every call.
  const app = pickedApp && apps.includes(pickedApp) ? pickedApp : null;
  const sortedCalls = useMemo(() => {
    if (!calls.data || !callView) return null;
    const shown = new Set(callView.rows.map((p) => p.id));
    const label = (call: ListedCall) => {
      const first = call.people.map((id) => byId.get(id)).find((p) => p !== undefined);
      return first ? names.label(first).primary : "";
    };
    return sortCalls(filterCalls(calls.data, { shown, app, search: finds.calls }, byId, names), callSort, label);
  }, [calls.data, callView, app, finds.calls, byId, names, callSort]);
  // Changing a call holds the rows as they were (as setting a location does) while what chose and sorted them stays the same.
  const callBasis = JSON.stringify([queryBar.state.applied.query, hide, finds.calls, app, callSort, names.hidden]);
  const [heldCallKeys, setHeldCallKeys] = useState<{ basis: string; keys: string[] } | null>(null);
  useEffect(() => setHeldCallKeys(null), [callBasis]);
  const callRows = useMemo(
    () => (calls.data && heldCallKeys?.basis === callBasis ? heldCalls(heldCallKeys.keys, calls.data) : sortedCalls),
    [calls.data, heldCallKeys, callBasis, sortedCalls],
  );
  const callHolding = useRef({ basis: callBasis, rows: callRows });
  callHolding.current = { basis: callBasis, rows: callRows };
  const onCallEdit = useCallback(() => {
    const { basis, rows } = callHolding.current;
    setHeldCallKeys((last) => (last?.basis === basis ? last : { basis, keys: (rows ?? []).map(callKey) }));
  }, []);

  const status = callsShown
    ? (callRows && table.data ? null : calls.unavailable || table.unavailable ? "The message archive is not running, so there are no calls to list." : (calls.error ?? table.error ?? "Loading…"))
    : catchUpsShown
    ? (catchUpRows && table.data ? null : catchUps.unavailable || table.unavailable ? `The message archive is not running, so there are no ${HANGOUT.many} to list.` : (catchUps.error ?? table.error ?? "Loading…"))
    : view ? null : table.unavailable ? "The message archive is not running, so there is nobody to list." : (table.error ?? "Loading…");
  const peoplePanel = (at: { person: number | null; moment?: ChatMoment }) => (
    <PeoplePanel
      className="demos__docked"
      openId={at.person}
      moment={at.moment}
      onOpen={(person) => setPanel({ person })}
      onClose={() => setPanel(null)}
      preview={(id) => byId.get(id)}
    />
  );

  return (
    <div className={`demos${panel ? " demos--docked" : ""}`}>
      <div className="demos__map">
        <div className="demos__stage" role="tabpanel" id={TAB_PANEL} aria-labelledby={tabId(listing)}>
          {catchUpsShown && catchUpRows && table.data && (
            <CatchUpsTable
              rows={catchUpRows}
              sort={catchUpSort}
              onSort={(column) => setCatchUpSort(nextCatchUpSort(catchUpSort, column))}
              openId={panel?.person ?? null}
              onOpenAt={onOpenAt}
              navigate={navigate}
              editing={editing}
              onEdit={setEditing}
              settings={table.data.settings}
              top={header.height}
            />
          )}
          {callsShown && callRows && table.data && (
            <CallsTable
              rows={callRows}
              sort={callSort}
              onSort={(column) => setCallSort(nextCallSort(callSort, column))}
              people={byId}
              openId={panel?.person ?? null}
              onOpen={onOpen}
              onOpenAt={onOpenAt}
              navigate={navigate}
              onEdit={onCallEdit}
              top={header.height + QUERY_LINE}
            />
          )}
          {listing === "people" && view && table.data && (
            <PeopleTable
              rows={rows}
              ranks={view.ranks}
              sort={shownSort}
              onSort={(column) => setSort(nextSort(shownSort, column))}
              openId={panel?.person ?? null}
              onOpen={onOpen}
              now={table.data.generatedAt}
              top={header.height + QUERY_LINE}
              columns={columns}
              edit={edit}
            />
          )}
          {status && <p className="demos__status">{status}</p>}
        </div>
        <header className="demos__header" ref={headerRef}>
          <ViewSwitcher current="table" crumb={demoMode ? "Friend map · demo" : "Friend map"} navigate={navigate} names />
          <TableTabs rows={listing} onChange={setListing} />
          <div className="demos__controls">
            {listing === "people" && view && (
              <span>
                {number(rows.length)}
                {rows.length < view.everyone.length && <> of {number(view.everyone.length)}</>} people
              </span>
            )}
            {catchUpsShown && catchUpRows && catchUps.data && (
              <span>
                {number(catchUpRows.length)}
                {catchUpRows.length < catchUps.data.length && <> of {number(catchUps.data.length)}</>}
                {(catchUpRows.length < catchUps.data.length ? catchUps.data.length : catchUpRows.length) === 1 ? ` ${HANGOUT.one}` : ` ${HANGOUT.many}`}
              </span>
            )}
            {callsShown && callRows && calls.data && (
              <span>
                {number(callRows.length)}
                {callRows.length < calls.data.length && <> of {number(calls.data.length)}</>}
                {(callRows.length < calls.data.length ? calls.data.length : callRows.length) === 1 ? " call" : " calls"}
              </span>
            )}
            <input
              className="demos__find"
              type="search"
              aria-label={catchUpsShown ? `Find a ${HANGOUT.one} by who or note` : callsShown ? "Find a call by who or note" : "Find a person"}
              placeholder={catchUpsShown || callsShown ? "Find by who or note" : "Find a person"}
              value={finds[listing]}
              onChange={(event) => {
                const words = event.target.value;
                setFinds((last) => ({ ...last, [listing]: words }));
              }}
            />
            {/* These change the archive, which a read-only page (demo mode) does not. Each tab adds to its own list. */}
            {!readOnly && listing === "people" && <AddPerson onOpen={onOpen} />}
            {!readOnly && listing === "people" && tags.data && <TagManager tags={tags.data} onRenamed={onRenamed} />}
            {!readOnly && catchUpsShown && <AddEvent kind="hangout" />}
            {!readOnly && callsShown && <AddEvent kind="call" onOpen={() => setHeldCallKeys(null)} />}
            {!readOnly && <ChangesPanel onOpen={onOpen} />}
            <button type="button" className="demos__people" onClick={() => setPanel(panel && panel.person === null ? null : { person: null })}>
              People
            </button>
          </div>
          {!catchUpsShown && <QueryBar
            bar={queryBar}
            examples={demoMode ? EXAMPLES : undefined}
            hide={callsShown ? callView && (
              <>
                <AppPicker apps={apps} app={app} onChange={setApp} />
                <HidePanel entries={callView.hideEntries} choices={hide} onChange={setHide} />
              </>
            ) : view && (
              <>
                <PlatformPicker platforms={platforms} platform={platform} onChange={setPlatform} />
                <HidePanel entries={view.hideEntries} choices={hide} onChange={setHide} />
              </>
            )}
          />}
        </header>
        <ErrorNotice />
        <ChangeChip />
      </div>
      <Dock open={panel !== null} onClosed={closed}>{shown && peoplePanel(shown)}</Dock>
    </div>
  );
}

/** The one tab panel the tabs control: the Table's stage. */
const TAB_PANEL = "table-list";
const tabId = (rows: TableRows) => `table-tab-${rows}`;

const TAB_HINTS: Record<TableRows, string> = {
  people: "One row per person",
  "catch-ups": `One row per ${HANGOUT.one}, the newest first`,
  calls: "One row per call, from every source, the newest first",
};

/**
 * People, hangouts (catch-ups) or calls: what the Table lists, as tabs. The chosen one alone is in the Tab order;
 * the arrow keys, Home and End move to another and choose it.
 */
function TableTabs({ rows, onChange }: { rows: TableRows; onChange: (rows: TableRows) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABLE_TABS.findIndex((tab) => tab.rows === rows);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABLE_TABS.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = TABLE_TABS[(to + TABLE_TABS.length) % TABLE_TABS.length].rows;
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  };
  return (
    <div className="table-tabs" role="tablist" aria-label="What the table lists" onKeyDown={onKeyDown}>
      {TABLE_TABS.map((tab) => (
        <button
          key={tab.rows}
          type="button"
          role="tab"
          id={tabId(tab.rows)}
          aria-selected={rows === tab.rows}
          aria-controls={rows === tab.rows ? TAB_PANEL : undefined}
          tabIndex={rows === tab.rows ? 0 : -1}
          title={TAB_HINTS[tab.rows]}
          onClick={() => onChange(tab.rows)}
        >
          {tab.title}
        </button>
      ))}
    </div>
  );
}

/** All platforms, or one: only people with an account there, counted there alone. */
export function PlatformPicker({ platforms, platform, onChange }: {
  platforms: readonly string[];
  platform: string | null;
  onChange: (platform: string | null) => void;
}) {
  return (
    <select
      className="demos__method"
      aria-label="Platform"
      title="Only people with an account on one platform, with Messages, Direct and Last message counted there alone, or with Phone calls their answered calls, call time and last call (closeness stays over every platform)"
      value={platform ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">All platforms</option>
      {platforms.map((p) => <option key={p} value={p}>{tablePlatformName(p)}</option>)}
    </select>
  );
}

/** Every app, or one: only the calls on it (callApp in callsTable.ts: Phone, FaceTime, WhatsApp...). */
function AppPicker({ apps, app, onChange }: { apps: readonly string[]; app: string | null; onChange: (app: string | null) => void }) {
  return (
    <select className="demos__method" aria-label="App" title="Only the calls on one app" value={app ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">All apps</option>
      {apps.map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  );
}
