// Whether the page can change anything. The app's page can, except the demo's
// (demoMode.ts, at /demo and the static demo): its archive refuses every
// write, and its person panel shows what an editor would edit (name, aliases,
// tags, location, note, reaching out, accounts) as plain text, with no button,
// box or switch to change it. The static demo's entry (src/demo/main.tsx) and
// the app's entry in demo mode (src/main.tsx) wrap everything in the provider;
// the pieces of the person panel (PersonParts.tsx, PersonFields.tsx,
// PeoplePanel.tsx) ask useReadOnly.

import { createContext, useContext } from "react";

export const ReadOnly = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnly);
}
