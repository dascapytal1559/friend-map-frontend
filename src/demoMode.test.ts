// The demo (demoMode.ts): the static demo alone, its own app on a site of its
// own, the map views of the real app's again (DEMO_VIEWS), chosen by how the
// page was built (the old Demo switch's stored choice is cleared, never read);
// the app holds none. On its pages nothing is asked of a server (every archive
// call, its live updates and the usage record stay in the page), and every view
// draws the made-up crowd.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArchiveApi } from "./archiveApi.ts";
import { httpArchive } from "./archiveHttp.ts";
import { demoApp } from "./demo/app.ts";
import { generateDemo, SMALL_CROWD } from "./demo/generate.ts";
import { demoMode, forgetOldDemoMode, keptAs, OLD_DEMO_MODE_KEY } from "./demoMode.ts";
import { DEMOS } from "./demos/Demos.tsx";
import { Orbits3DMap } from "./demos/Orbits3D.tsx";
import { Methodology } from "./demos/Methodology.tsx";
import { buildModel } from "./demos/model.ts";
import { httpApp } from "./appHttp.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";
import { DEMO_VIEWS } from "./views.ts";

const NOW = Date.parse("2026-10-01T12:00:00+10:00");

describe("which page is the demo's", () => {
  it("lists, on the static demo's site, its own views alone, so its files carry no other view", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "static-demo");
    const { DEMOS: own } = await import("./demos/Demos.tsx");
    expect(own.map((demo) => demo.slug)).toEqual([...DEMO_VIEWS]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is the static demo's alone, from how it was built: the app is never the demo, an old /demo address included", async () => {
    expect(demoMode).toBe(false);
    for (const path of ["/demo", "/demo/spider", "/friend-map/demo/city", "/"]) {
      vi.resetModules();
      vi.stubGlobal("location", { pathname: path });
      const { demoMode: opened } = await import("./demoMode.ts");
      expect([path, opened]).toEqual([path, false]);
    }
    vi.resetModules();
    vi.stubEnv("MODE", "static-demo");
    expect((await import("./demoMode.ts")).demoMode).toBe(true);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe("the old Demo switch's choice", () => {
  it("is cleared, so a browser that left demo mode on opens the real app as itself", () => {
    const items = new Map([[OLD_DEMO_MODE_KEY, "on"], ["friend-map.names", "demo"]]);
    forgetOldDemoMode(() => ({ removeItem: (key: string) => void items.delete(key) }));
    expect(items.has(OLD_DEMO_MODE_KEY)).toBe(false);
    // The name choice is the real app's own again, and kept.
    expect(items.get("friend-map.names")).toBe("demo");
  });

  it("is left alone where the browser keeps nothing", () => {
    expect(() => forgetOldDemoMode(() => undefined)).not.toThrow();
    expect(() => forgetOldDemoMode(() => ({ removeItem: () => {
      throw new Error("blocked");
    } }))).not.toThrow();
  });
});

describe("what the demo keeps", () => {
  it("keeps your own words apart: the demo's Query bar and Hide are remembered under keys of their own", () => {
    expect(keptAs("friend-map.query", false)).toBe("friend-map.query");
    expect(keptAs("friend-map.query", true)).toBe("friend-map.query@demo");
    expect(keptAs("friend-map.table.hide", true)).not.toBe("friend-map.table.hide");
  });
});

/** Every call of the archive, with arguments a page might pass. */
function callEverything(api: ArchiveApi, person: number, group: number): Promise<unknown>[] {
  const settings = DEFAULT_SETTINGS;
  const catchUp = { date: "2026-09-01", hours: 2, note: "", people: [person] } as never;
  return [
    api.people(), api.people({ query: "a", tag: "climbing" }), api.person(person), api.setNames(person, ["x"]),
    api.setTags(person, []), api.setNote(person, ""), api.setShouldReachOut(person, true), api.drafts(person), api.addDraft(person, "x"), api.setDraft(1, ""),
    api.setLocation(person, null), api.join(person, person + 1), api.detach(person, 1), api.tags(), api.createTag("x"),
    api.renameTag("x", "y"), api.moveTag("x", 0), api.deleteTag("x"), api.locations(), api.proposals(), api.confirm(1), api.reject(1),
    api.contract(), api.changes(), api.changeset(1), api.undoChange(1), api.relationships(), api.relationships("climbing", true),
    api.table(settings), api.catchUps(), api.catchUps(person), api.addCatchUp(catchUp), api.changeCatchUp(1, catchUp),
    api.deleteCatchUp(1), api.addCall({ people: [{ personId: person, accountId: null, app: "phone" }], day: "2026-09-01", time: "19:30", minutes: 20, note: "" }), api.loggedCall(1), api.changeCall(1, { people: [{ personId: person, accountId: null, app: "phone" }], day: "2026-09-01", time: "19:30", minutes: 20, note: "" }), api.deleteCall(1), api.sendTargets(person), api.activity(person, DEFAULT_SETTINGS), api.calls(person), api.calls(person, 1),
    api.groups(person), api.group(group), api.archiveUntouched(group, []), api.query("climbing"), api.query("SELECT 1", ["archive"]),
    api.generateQuery("", "everyone I climb with"), api.timeline(person), api.timeline(person, { groups: true, count: true }),
    api.conversation(group), api.send(group, "hi"),
    api.calendarMonth("2026-09"), api.calendarDay("2026-09-20"), api.dayMessages(group, "2026-09-20"),
  ];
}

describe("on the demo's pages the page asks a server for nothing", () => {
  const fetch = vi.fn(() => Promise.reject(new Error("no server here")));
  const EventSource = vi.fn(function () {
    return { addEventListener: () => {}, close: () => {} };
  });
  beforeAll(() => {
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("EventSource", EventSource);
  });
  afterEach(() => {
    fetch.mockClear();
    EventSource.mockClear();
  });

  it("answers every archive call, writes refused, from the page itself", async () => {
    // The static demo's entry gives every page the made-up crowd's archive and the demo's own app (src/demo/main.tsx).
    const { DemoArchive } = await import("./demo/archive.ts");
    const api = new DemoArchive(generateDemo(NOW, SMALL_CROWD)).api;
    const app = demoApp;
    const own = await Promise.allSettled([app.settings(), app.mePhoto(), app.setMePhoto(new Blob([new Uint8Array([0xff, 0xd8, 0xff])])), app.removeMePhoto()]);
    expect(own.map((a) => a.status)).toEqual(["fulfilled", "fulfilled", "rejected", "rejected"]);
    const someone = (await api.people()).people[0].id;
    const group = (await api.groups(someone))[0]?.id ?? 1;
    const answers = await Promise.allSettled(callEverything(api, someone, group));
    expect(answers.length).toBeGreaterThan(45);
    // The sun is always the sun: no photo of yours.
    expect(await app.mePhoto()).toBeNull();
    // Every write is refused as the demo's, not by a server.
    expect(answers.filter((a) => a.status === "rejected").map((a) => String((a as PromiseRejectedResult).reason))).not.toContain("Error: no server here");
    api.attachmentUrl(1);
    api.follow(() => {})();
    expect(fetch).not.toHaveBeenCalled();
    expect(EventSource).not.toHaveBeenCalled();
  });

  it("and in the real app the same calls go to the server, so the check above would see them", async () => {
    const api = httpArchive;
    await Promise.allSettled([...callEverything(api, 1, 1), httpApp.settings()]);
    api.follow(() => {})();
    expect(fetch.mock.calls.length).toBeGreaterThan(46);
    expect(EventSource).toHaveBeenCalledOnce();
  });
});

// Only these files reach the network: the server's archive (only ever reached
// through archiveApi, which the demo points at the made-up crowd), the usage
// record (which records nothing in the demo) and the saved view settings (sent
// only once the real app's page starts saving them). A new one has to be added
// here, and so be made to keep out of the demo.
const NETWORK = /\bfetch\(|new EventSource\(|sendBeacon\(|XMLHttpRequest|new WebSocket\(/;
const REACHES_THE_NETWORK = ["appHttp.ts", "archiveHttp.ts", "savedStore.ts", "usage.ts"];

describe("what reaches the network", () => {
  const src = new URL(".", import.meta.url).pathname;
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
    );

  it("is only the server's archive, the usage record and the saved view settings", () => {
    const reaching = files(src).filter((file) => NETWORK.test(readFileSync(file, "utf8"))).map((file) => relative(src, file)).sort();
    expect(reaching).toEqual([...REACHES_THE_NETWORK].sort());
  });

  it("records no usage in the demo", () => {
    expect(readFileSync(join(src, "usage.ts"), "utf8")).toMatch(/if \(demoMode\) return;\s*void fetch\(address\("\/api\/usage"\)/);
  });

  it("saves no view settings from the demo: only the real app's page starts saving", () => {
    expect(readFileSync(join(src, "main.tsx"), "utf8")).toContain("startSaving();");
    expect(readFileSync(join(src, "demo", "main.tsx"), "utf8")).not.toContain("startSaving");
  });

  it("the app's page takes the server's archive before anything draws, and holds no demo of its own", () => {
    const main = readFileSync(join(src, "main.tsx"), "utf8");
    expect(main).toContain("provideArchive(httpArchive);");
    expect(main).toContain("provideApp(httpApp);");
    expect(main.indexOf("provideArchive(")).toBeLessThan(main.indexOf("createRoot("));
    // Nothing of the made-up crowd is in the app's page (the captain's ask: "let's not even house a local demo").
    expect(main).not.toMatch(/from "\.\/demo\/|\bdemoMode\b(?!\.ts)/);
    expect(main).toContain("forgetOldDemoMode();");
  });
});

describe("the static demo's page", () => {
  const demo = readFileSync(new URL("./demo/main.tsx", import.meta.url), "utf8");
  const html = readFileSync(new URL("./demo/index.html", import.meta.url), "utf8");

  it("is the app's demo, its archive the made-up crowd held in the page, read only and marked, with neither Table nor Calendar", () => {
    expect(demo).toContain("provideArchive(new DemoArchive(generateDemo()).api);");
    expect(demo.indexOf("provideArchive(")).toBeLessThan(demo.indexOf("createRoot("));
    expect(demo).toMatch(/<ReadOnly\.Provider value=\{true\}>\s*<Demos \/>/);
    expect(demo).not.toMatch(/archiveHttp|appHttp|TablePage|CalendarPage/);
  });

  it("is marked as the demo in the map, so the note is centred on the map beside the person panel", () => {
    const demos = readFileSync(new URL("./demos/Demos.tsx", import.meta.url), "utf8");
    const map = demos.slice(demos.indexOf('<div className="demos__map"'), demos.indexOf("{docked ? ("));
    expect(map).toContain("{demoMode && <DemoModeMark />}");
  });

  it("hangs its note from the top of the map, not the foot (the user's ask: \"move demo disclaim text to top instead of bottom\")", () => {
    const note = readFileSync(new URL("./demoMode.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = note.match(/\.demo-mode\s*{([^}]*)}/)?.[1] ?? "";
    expect(rule).toMatch(/\btop:/);
    expect(rule).not.toMatch(/\bbottom:/);
  });

  it("may reach no network and loads only its own files", () => {
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(policy.split("; ")).toEqual(expect.arrayContaining(["default-src 'none'", "script-src 'self'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'"]));
  });
});

describe("in the demo every view draws the made-up crowd", () => {
  const data = generateDemo(NOW, SMALL_CROWD);
  const crowd = new Set(data.people.map((p) => p.name));
  let api: ArchiveApi;
  beforeAll(async () => {
    // The map asks the window whether motion is reduced, and names are measured on a canvas; neither is here.
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    const { DemoArchive } = await import("./demo/archive.ts");
    api = new DemoArchive(data).api;
  });
  const named = (html: string) => [...crowd].filter((name) => html.includes(name.split(" ")[0]));

  it("Orbits (the solar system) and the Spider web, from its map report", async () => {
    const model = buildModel(await api.relationships(), { settings: DEFAULT_SETTINGS });
    expect(model.people.length).toBeGreaterThan(50);
    expect(DEMOS.filter((demo) => DEMO_VIEWS.includes(demo.slug)).map((demo) => demo.slug)).toEqual([...DEMO_VIEWS]);
    for (const demo of DEMOS.filter((d) => DEMO_VIEWS.includes(d.slug))) {
      // Orbits 3D is loaded lazily on the page; here it is drawn straight from its file.
      const View = demo.slug === "orbits-3d" ? Orbits3DMap : demo.View;
      const html = renderToStaticMarkup(createElement(View, {
        model, width: 1600, height: 1000, inset: 80, hover: () => {}, open: () => {}, held: null, heldGroup: null, find: null,
      }));
      const drawn = named(html).length >= 1;
      expect([demo.slug, drawn]).toEqual([demo.slug, true]);
    }
  }, 30_000);

  it("Methodology, with the demo's numbers and its defaults", async () => {
    const model = buildModel(await api.relationships(), { settings: DEFAULT_SETTINGS });
    const html = renderToStaticMarkup(createElement(Methodology, { model, onClose: () => {}, demo: true }));
    expect(html).toContain("The demo keeps the defaults.");
  });

  it("a person's chat, from the made-up lines", async () => {
    const someone = (await api.people()).people.find((p) => p.directMessageCount > 0)!;
    const page = await api.timeline(someone.id);
    expect(page.messages.length).toBeGreaterThan(0);
    expect(crowd.has(someone.name)).toBe(true);
  });
});
