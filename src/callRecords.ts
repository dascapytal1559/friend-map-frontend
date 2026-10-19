// What you changed on call records on this page since it loaded (the
// chat's "Add length", the Table's Calls): each one's length and note, by call
// record (message id), so the chat shows a call as it is now without loading
// again, and goes back when the chip's Undo takes a change back
// (changeChip.ts). A call not here reads as the chat loaded it.

import type { TimelineMessage } from "./archive.ts";

/** A call record's length, as the chat reads it. */
export type CallLength = Pick<TimelineMessage, "callSeconds" | "callLengthGiven">;

/** What may be changed on a call record: its length and its note. */
export type CallRecordState = CallLength & Pick<TimelineMessage, "callNote">;

const changed = new Map<number, Partial<CallRecordState>>();
const listeners = new Set<() => void>();

export const callRecords = {
  /** What the page last saved for call record `messageId`, if anything: the same object until it changes again. */
  get: (messageId: number): Partial<CallRecordState> | undefined => changed.get(messageId),
  /** Saves `change` for call record `messageId`, over what was saved before. */
  set(messageId: number, change: Partial<CallRecordState>): void {
    changed.set(messageId, { ...changed.get(messageId), ...change });
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
