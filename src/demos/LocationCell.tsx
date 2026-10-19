// Setting where people are from the Table's rows, a person after another (the
// user's ask: to go through the whole table quickly adding everyone's
// location). The Location cell is a button: a click, or Enter on it, opens a
// box in its place with a list under it of the values in use, the most used
// first, that what is typed narrows, offering what is typed as a new value and,
// when they have one, None to clear it (locationChoices in table.ts). Arrow
// keys move through the list, Enter sets the one picked, Escape or leaving the
// box sets nothing. Up and down arrows on the button move to the same button a
// row up or down. Nothing here opens the person panel; the rest of the row
// does. Each change is saved at once, one changeset with the chip's Undo
// (saveLocation in changeChip.ts), by the row (PersonRow in Table.tsx).

import { type KeyboardEvent, type MouseEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chosenLocation, isLocation, type LocationChoice, locationChoices } from "./table.ts";

/** Keeps a click or key in these cells from reaching the row, which would open the person panel. */
export const keepFromRow = (event: MouseEvent) => event.stopPropagation();

/** Up and down on a button in a cell: to the same button in the same cell a row up or down, if that row is drawn. */
export function moveUpOrDown(event: KeyboardEvent<HTMLTableCellElement>): void {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || !(event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  event.stopPropagation();
  const cell = event.currentTarget;
  const row = cell.parentElement;
  const next = event.key === "ArrowDown" ? row?.nextElementSibling : row?.previousElementSibling;
  if (!(next instanceof HTMLTableRowElement) || next.tabIndex < 0) return;
  const at = [...cell.querySelectorAll("button")].indexOf(event.target);
  const button = next.cells[cell.cellIndex]?.querySelectorAll("button")[at];
  if (!button) return;
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: "nearest" });
}

/** The Location cell, to change where they are: `values` are the values in use, the most used first. */
export function LocationCell({ location, values, onSave }: {
  location: string | null;
  values: readonly string[];
  onSave: (location: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Back on the button once the box closes, so the arrow keys go on from here.
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    button.current?.focus({ preventScroll: true });
  }, [editing]);
  const close = (again: boolean) => {
    refocus.current = again;
    setEditing(false);
  };

  return (
    <td className="people-table__location" title={editing ? undefined : location ?? undefined} onClick={keepFromRow} onKeyDown={moveUpOrDown}>
      {editing ? (
        <LocationEditor
          location={location}
          values={values}
          onPick={(next) => {
            close(true);
            onSave(next);
          }}
          onCancel={close}
        />
      ) : (
        <button type="button" ref={button} className="people-table__cell-button" title="Change where they are" onClick={() => setEditing(true)}>
          {location ?? <span className="people-table__add">Add</span>}
        </button>
      )}
    </td>
  );
}

/** The box and its list: typing narrows the list, arrows move through it, Enter picks; Escape or leaving the box cancels. */
function LocationEditor({ location, values, onPick, onCancel }: {
  location: string | null;
  values: readonly string[];
  onPick: (location: string | null) => void;
  /** With true when the cell's button should have the focus back (Escape), false when it went elsewhere. */
  onCancel: (refocus: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const choices = useMemo(() => locationChoices(values, draft, location), [values, draft, location]);
  // Starts on where they are now, so Enter alone keeps it.
  const [active, setActive] = useState(() => Math.max(0, choices.findIndex((c) => c.kind === "value" && isLocation(location, c.value))));
  const input = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const id = useId();
  const optionId = (i: number) => `${id}-${i}`;

  // The list is drawn over the page (the cell clips what spills out), under the box wherever the table scrolls.
  useLayoutEffect(() => {
    const place = () => input.current && setBox(input.current.getBoundingClientRect());
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  // Once picked or cancelled, the box going (and so losing the focus) cancels nothing more.
  const done = useRef(false);
  const finish = (then: () => void) => {
    if (done.current) return;
    done.current = true;
    then();
  };
  const pick = (choice: LocationChoice | undefined) => finish(() => (choice ? onPick(chosenLocation(choice)) : onCancel(true)));
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (choices.length > 0) setActive((at) => (at + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
    } else if (event.key === "Enter") pick(choices[active]);
    else if (event.key === "Escape") finish(() => onCancel(true));
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const root = input.current?.closest(".demos") ?? document.body;

  return (
    <>
      <input
        ref={input}
        className="people-table__location-box"
        autoFocus
        role="combobox"
        aria-label="Location"
        aria-expanded={choices.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={choices.length > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        placeholder={location ?? "Type a place"}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => finish(() => onCancel(false))}
      />
      {box && choices.length > 0 && createPortal(
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Locations"
          className="location-choices"
          style={{ left: Math.max(8, Math.min(box.left, window.innerWidth - 228)), top: box.bottom + 2, minWidth: Math.max(box.width, 180) }}
          // Keeps the box focused while a choice is clicked.
          onMouseDown={(event) => event.preventDefault()}
        >
          {choices.map((choice, i) => (
            <li
              key={choice.kind === "none" ? "" : `${choice.kind}:${choice.value}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={choice.kind === "value" ? undefined : "location-choices__other"}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(choice)}
            >
              {choice.kind === "none" ? "None (clear it)" : choice.kind === "new" ? <>Add “{choice.value}”</> : choice.value}
              {choice.kind === "value" && isLocation(location, choice.value) && <span className="location-choices__now"> now</span>}
            </li>
          ))}
        </ul>,
        root,
      )}
    </>
  );
}

