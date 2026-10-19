// The When cell of the Table's Hangouts and Calls: the date and time, as a
// link that opens the Calendar at that day, its day panel open (calendarDay,
// calendar.ts). Each chip in Who opens that person's chat at the moment
// instead (onOpenAt, ChatMoment, Timeline.tsx).

import type { ReactNode } from "react";
import { address } from "../mount.ts";
import type { Navigate } from "../ViewSwitcher.tsx";
import { calendarDay, longDay } from "./calendar.ts";
import { keepFromRow } from "./LocationCell.tsx";
import "./whenCell.css";

export function WhenCell({ when, day, navigate }: {
  /** The date and time, as the cell shows them. */
  when: ReactNode;
  /** Its local day, 2026-10-04. */
  day: string;
  navigate: Navigate;
}) {
  const to = calendarDay(day);
  return (
    // The row's own click opens a panel: not from in here.
    <td className="when-cell" onClick={keepFromRow}>
      <a className="when-cell__open" href={address(to)} title={`Open the Calendar on ${longDay(day)}`} onClick={navigate(to)}>
        {when}
      </a>
    </td>
  );
}
