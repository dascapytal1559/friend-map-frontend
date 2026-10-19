import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useShowGroups } from "./showGroups.ts";

describe("show group messages", () => {
  it("starts off and never reads the browser's old saved choice", () => {
    let seen: boolean | undefined;
    function Probe() {
      seen = useShowGroups()[0];
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(seen).toBe(false);
  });
});
