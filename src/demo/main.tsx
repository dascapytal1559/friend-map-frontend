import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { provideApp } from "../appApi.ts";
import { provideArchive } from "../archiveApi.ts";
import { takeContract } from "../contract/handshake.ts";
import { Demos } from "../demos/Demos.tsx";
import { ReadOnly } from "../readOnly.ts";
import { movedAddress } from "../views.ts";
import { demoApp } from "./app.ts";
import { DEMO_CONTRACT, DemoArchive } from "./archive.ts";
import { generateDemo } from "./generate.ts";

// The static demo's entry (npm run build:demo; src/main.tsx is the app's): the
// app's demo, the very pages /demo shows in the app, at the root of a site of
// its own, read-only and marked as the demo. Its archive is the made-up crowd,
// made in the page as it opens (half a second or so) and held in it: there is
// no server behind these files. The page says what it is doing first
// (index.html), and the crowd is made once that has been drawn.

// An older address (/web, now /spider) is rewritten where it is, for any host
// that does not read _redirects (Vite's preview among them).
const moved = movedAddress(window.location);
if (moved) window.history.replaceState(null, "", moved);

await new Promise((drawn) => requestAnimationFrame(() => setTimeout(drawn)));
// Its handshake first: the crowd is made in its time zone.
takeContract(DEMO_CONTRACT);
provideArchive(new DemoArchive(generateDemo()).api);
provideApp(demoApp);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReadOnly.Provider value={true}>
      <Demos />
    </ReadOnly.Provider>
  </StrictMode>,
);
