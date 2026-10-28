import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { provideApp } from "./appApi.ts";
import { archiveApi, provideArchive } from "./archiveApi.ts";
import { BackendRefused } from "./BackendRefused.tsx";
import { NoBackend } from "./NoBackend.tsx";
import { shakeHands, takesEdits } from "./contract/handshake.ts";
import { demoMode, forgetOldDemoMode } from "./demoMode.ts";
import { address, appPath } from "./mount.ts";
import { pageApp, pageArchive } from "./pageArchive.ts";
import { ReadOnly } from "./readOnly.ts";
import { startSaving } from "./savedStore.ts";
import { listenToEmbedder } from "./theme.ts";
import { movedAddress } from "./views.ts";

// The app's page: the real app, on the server's archive, or the demo at /demo,
// on the made-up crowd held in the page and read-only (pageArchive.ts,
// demoMode.ts; src/demo/main.tsx is the static demo's entry). Which is read
// from the address before anything draws, so nothing on the demo's pages ever
// asks the server for real data.

// The map views (the Spider web at /, which leads to /spider, Orbits at
// /orbits, and the rest; see views.ts, and each again under /demo).
// Addresses from before the views moved (/demos/..., /web, now /spider, and
// the canvas, since retired) are rewritten to where they are now.
const { pathname, search, hash } = window.location;
const moved = movedAddress({ pathname: appPath(pathname), search, hash });
if (moved) window.history.replaceState(null, "", address(moved));
// Held in an object, not a capitalized name of its own, which React Refresh would take for a component: that would
// make this entry take hot updates itself, running createRoot again on every edit beneath it, not reloading the page.
const views = { Demos: lazy(() => import("./demos/Demos.tsx").then((m) => ({ default: m.Demos }))) };
// The Table and the Calendar, pages of their own beside the map views, each loaded when it is opened.
const pages = {
  table: lazy(() => import("./demos/TablePage.tsx").then((m) => ({ default: m.TablePage }))),
  calendar: lazy(() => import("./demos/CalendarPage.tsx").then((m) => ({ default: m.CalendarPage }))),
};

provideArchive(await pageArchive());
provideApp(pageApp());
// The backend's handshake, before anything is drawn or counted: what it serves, and its time zone (src/contract/).
const shaken = await shakeHands(archiveApi);
// The old Demo switch's choice (demo mode kept per browser) is gone: the demo is /demo.
forgetOldDemoMode();
// The Spider web's settings are kept on the server in the real app; the demo keeps its visitor's in the browser.
if (!demoMode) startSaving();
// Embedded in the console, the page takes the console's look (theme.ts).
listenToEmbedder();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {shaken !== null ? (
      "refused" in shaken ? <BackendRefused why={shaken.refused} /> : <NoBackend why={shaken.down} />
    ) : (
      <ReadOnly.Provider value={demoMode || !takesEdits()}>
        <Suspense>
          <views.Demos pages={pages} />
        </Suspense>
      </ReadOnly.Provider>
    )}
  </StrictMode>,
);
