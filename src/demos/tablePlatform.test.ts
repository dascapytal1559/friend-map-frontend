import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { columnsFor, tablePlatformName } from "./Table.tsx";
import { PlatformPicker } from "./TablePage.tsx";
import { loadTablePlatform, saveTablePlatform } from "./tablePlatform.ts";

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("the Table's platform", () => {
  it("is all platforms until one is picked, then remembered; all again forgets it", () => {
    const storage = memory();
    expect(loadTablePlatform(() => storage)).toBeNull();
    saveTablePlatform("whatsapp", () => storage);
    expect(loadTablePlatform(() => storage)).toBe("whatsapp");
    saveTablePlatform(null, () => storage);
    expect(loadTablePlatform(() => storage)).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it("is all platforms without storage or when storage refuses", () => {
    expect(loadTablePlatform(() => undefined)).toBeNull();
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(loadTablePlatform(refusing)).toBeNull();
    expect(() => saveTablePlatform("whatsapp", refusing)).not.toThrow();
  });

  it("names itself in the headers that count it alone, which widen for it", () => {
    const all = columnsFor(null);
    const whatsapp = columnsFor("whatsapp");
    const titles = (columns: typeof all) => columns.map((c) => c.title);
    expect(titles(all)).toContain("Messages");
    expect(titles(whatsapp)).toEqual(titles(all).map((t) => (["Messages", "Direct", "Last message"].includes(t) ? `${t} · WhatsApp` : t)));
    const width = (columns: typeof all, title: string) => columns.find((c) => c.title.startsWith(title))!.width;
    expect(width(whatsapp, "Messages")).toBeGreaterThan(width(all, "Messages"));
    expect(width(whatsapp, "Closeness")).toBe(width(all, "Closeness"));
    expect(whatsapp.find((c) => c.column === "direct")!.hint).toMatch(/on WhatsApp only$/);
  });

  it("shows Phone calls with call columns in place of the message columns, which it has nothing in", () => {
    const titles = columnsFor("phone").map((c) => c.title);
    expect(titles).toEqual(columnsFor(null).map((c) => c.title).map((t) => ({ Messages: "Answered calls", Direct: "Call time", "Last message": "Last call" })[t] ?? t));
    expect(columnsFor("phone").find((c) => c.column === "callTime")).toMatchObject({ numeric: true, hint: "How long the answered calls were connected, in all" });
    expect(tablePlatformName("phone")).toBe("Phone calls");
    expect(tablePlatformName("whatsapp")).toBe("WhatsApp");
  });

  it("is picked from all platforms and each one there is, by the name shown", () => {
    const html = renderToStaticMarkup(createElement(PlatformPicker, { platforms: ["imessage", "phone", "whatsapp"], platform: "whatsapp", onChange: () => {} }));
    expect(html).toContain('aria-label="Platform"');
    expect([...html.matchAll(/<option[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(["All platforms", "iMessage", "Phone calls", "WhatsApp"]);
    expect(html).toMatch(/<option value="whatsapp" selected="">/);
  });
});
