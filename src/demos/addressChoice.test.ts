// A choice the address alone decides (addressChoice.ts): read from the query,
// written into it in place, remembered nowhere else.

import { afterEach, describe, expect, it, vi } from "vitest";
import { addressChoice } from "./addressChoice.ts";

/**
 * A browser's address bar, as the choice sees it: the address, and a history
 * whose replaceState changes it in place (as a browser's does) and counts its
 * calls; `open` is a fresh page load at another address.
 */
export function browser(pathname = "/spider", search = "") {
  const location = { pathname, search, hash: "" };
  const replaced: string[] = [];
  const history = {
    replaceState: (_state: unknown, _title: string, url: string) => {
      replaced.push(url);
      const at = new URL(url, "http://localhost");
      location.pathname = at.pathname;
      location.search = at.search;
      location.hash = at.hash;
    },
  };
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", history);
  return {
    location,
    replaced,
    open(path: string, query = "") {
      location.pathname = path;
      location.search = query;
    },
  };
}

const flavour = addressChoice("flavour", ["plain", "mint", "lime"] as const, "plain");

afterEach(() => vi.unstubAllGlobals());

describe("a choice the address decides", () => {
  it("reads its parameter, and nothing else", () => {
    expect(flavour.inSearch("?flavour=mint")).toBe("mint");
    expect(flavour.inSearch("?a=1&flavour=lime")).toBe("lime");
    expect(flavour.inSearch("?flavour=salt")).toBeNull();
    expect(flavour.inSearch("")).toBeNull();
  });

  it("writes a value in and takes the fallback out, keeping the rest of the query", () => {
    expect(flavour.searchWith("", "mint")).toBe("?flavour=mint");
    expect(flavour.searchWith("?flavour=mint", "plain")).toBe("");
    expect(flavour.searchWith("?a=1&flavour=mint", "plain")).toBe("?a=1");
    expect(flavour.searchWith("?a=1", "lime")).toBe("?a=1&flavour=lime");
  });

  it("is the fallback with no address, or one that says nothing or something it does not know", () => {
    expect(flavour.get()).toBe("plain");
    const page = browser("/spider", "");
    expect(flavour.get()).toBe("plain");
    page.open("/spider", "?flavour=salt");
    expect(flavour.get()).toBe("plain");
    page.open("/spider", "?flavour=mint");
    expect(flavour.get()).toBe("mint");
  });

  it("writes a choice into the address in place, tells whoever listens, and takes the fallback out of it", () => {
    const page = browser("/spider", "?a=1");
    const heard: string[] = [];
    const stop = flavour.subscribe(() => heard.push(flavour.get()));
    flavour.set("lime");
    expect(page.replaced).toEqual(["/spider?a=1&flavour=lime"]);
    expect(flavour.get()).toBe("lime");
    flavour.set("plain");
    expect(page.replaced).toEqual(["/spider?a=1&flavour=lime", "/spider?a=1"]);
    expect(heard).toEqual(["lime", "plain"]);
    stop();
  });

  it("is the fallback again at a plain address even after another was chosen: nothing is remembered but the address", () => {
    const page = browser("/spider", "");
    flavour.set("mint");
    expect(flavour.get()).toBe("mint");
    page.open("/spider");
    expect(flavour.get()).toBe("plain");
    page.open("/spider", "?flavour=mint");
    expect(flavour.get()).toBe("mint");
  });
});

describe("a choice the address decides through a codec", () => {
  const shade = addressChoice<string>("shade", { read: (raw) => (/^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null), write: (value) => value.slice(1) }, "#000000");

  it("reads and writes whatever the codec knows, and the fallback for anything else", () => {
    expect(shade.inSearch("?shade=12ab34")).toBe("#12ab34");
    expect(shade.inSearch("?shade=blue")).toBeNull();
    expect(shade.searchWith("?a=1", "#12ab34")).toBe("?a=1&shade=12ab34");
    expect(shade.searchWith("?shade=12ab34", "#000000")).toBe("");
    const page = browser("/spider", "?shade=12ab34");
    expect(shade.get()).toBe("#12ab34");
    shade.set("#ffffff");
    expect(page.replaced).toEqual(["/spider?shade=ffffff"]);
  });
});
