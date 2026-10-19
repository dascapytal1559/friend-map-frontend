// "Add hangout" and "Add call", in the Table's header on the Hangouts and the Calls tabs (TablePage.tsx): Add event's
// form (CatchUps.tsx), on that kind (the other a click away, as in the panel), with nobody on it yet, to log one with
// anyone. It adds as the panel's does, with the chip's Undo, and the event takes its place in the list. Escape or
// Cancel closes it; not there on a read-only page.

import { useState } from "react";
import { EventForm, freshCall } from "../CatchUps.tsx";
import { freshCatchUp } from "../catchUps.ts";
import { HANGOUT } from "../eventWords.ts";
import "./table.css";

const HINTS = {
  hangout: `Log a ${HANGOUT.one}: who was there, when, for how long, and a note`,
  call: "Log a call no import knows of: who was on it, when, how long, and on what",
} as const;

/** `onOpen` is called as it opens (the Calls tab lets its held rows go, so the new call shows). */
export function AddEvent({ kind, onOpen }: { kind: "hangout" | "call"; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const title = `Add ${kind === "hangout" ? HANGOUT.one : "call"}`;
  return (
    <div className="add-event">
      <button
        type="button"
        className="demos__method"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={HINTS[kind]}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {title}
      </button>
      {open && (
        <div className="add-event__panel" role="dialog" aria-label={title}>
          <EventForm start={{ kind, hangout: freshCatchUp(), call: freshCall() }} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
