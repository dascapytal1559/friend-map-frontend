// The person panel's way back: people opened one from another inside it are
// steps back, in order; one opened from outside, or closing it, starts afresh;
// someone joined away is not a step back.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BackButton } from "./PeoplePanel.tsx";
import { back, historyOf, merged, NO_HISTORY, opened, type PersonStep } from "./personHistory.ts";

const step = (id: number, name: string): PersonStep => ({ id, name, aliases: [] });
const ada = step(1, "Ada Sample");
const ben = step(2, "Ben Example");

describe("the person panel's history", () => {
  it("has nobody before a person opened from outside", () => {
    expect(historyOf(NO_HISTORY, 1).previous).toEqual([]);
    expect(back(NO_HISTORY, 1)).toBeNull();
  });

  it("makes the person opened from a step back from the one opened", () => {
    const history = opened(NO_HISTORY, ada, 2);
    expect(historyOf(history, 2).previous).toEqual([ada]);
    expect(back(history, 2)).toEqual({ to: 1, history: { at: 1, previous: [], cameBack: true } });
  });

  it("walks back one step at a time, as far as it goes", () => {
    let history = opened(opened(NO_HISTORY, ada, 2), ben, 3);
    expect(historyOf(history, 3).previous).toEqual([ada, ben]);
    const first = back(history, 3)!;
    expect(first.to).toBe(2);
    history = first.history;
    const second = back(history, 2)!;
    expect(second.to).toBe(1);
    expect(back(second.history, 1)).toBeNull();
  });

  it("goes on from wherever going back reached", () => {
    const history = opened(back(opened(opened(NO_HISTORY, ada, 2), ben, 3), 3)!.history, ben, 4);
    expect(historyOf(history, 4).previous).toEqual([ada, ben]);
    expect(historyOf(history, 4).cameBack).toBe(false);
  });

  it("starts afresh for a person opened from outside", () => {
    const history = opened(opened(NO_HISTORY, ada, 2), ben, 3);
    expect(historyOf(history, 1).previous).toEqual([]);
    expect(back(history, 1)).toBeNull();
    // Opening someone from inside a person opened from outside starts from them alone.
    const dee = step(5, "Dee Placeholder");
    expect(historyOf(opened(history, dee, 4), 4).previous).toEqual([dee]);
  });

  it("is cleared by closing the panel, or going to the list", () => {
    const history = opened(NO_HISTORY, ada, 2);
    expect(historyOf(history, null)).toBe(NO_HISTORY);
    expect(back(history, null)).toBeNull();
  });

  it("is not changed by opening the person already showing", () => {
    const history = opened(NO_HISTORY, ada, 2);
    expect(opened(history, ben, 2)).toBe(history);
  });

  it("drops someone joined away, and the survivor now showing", () => {
    // Ada opened Ben, Ben opened Cy, and Cy is joined into Ada.
    const history = opened(opened(NO_HISTORY, ada, 2), ben, 3);
    const after = merged(history, 3, 1);
    expect(historyOf(after, 1).previous).toEqual([ben]);
    // Ben joined into someone new: Ada stays a step back from them.
    expect(historyOf(merged(opened(NO_HISTORY, ada, 2), 2, 9), 9).previous).toEqual([ada]);
  });
});

describe("the back arrow", () => {
  it("names the person it goes back to, in its label and tooltip", () => {
    const html = renderToStaticMarkup(createElement(BackButton, { label: "Ada", onBack: () => {} }));
    expect(html).toContain('aria-label="Back to Ada"');
    expect(html).toContain('title="Back to Ada"');
    expect(html).toContain("side-panel__back");
  });

  it("names nobody with names hidden", () => {
    const html = renderToStaticMarkup(createElement(BackButton, { label: "", onBack: () => {} }));
    expect(html).toContain('aria-label="Back to the previous person"');
    expect(html).not.toContain("Ada");
  });

  it("goes back when pressed", () => {
    let pressed = 0;
    const button = BackButton({ label: "Ada", onBack: () => pressed++ }) as { props: { onClick: () => void } };
    button.props.onClick();
    expect(pressed).toBe(1);
  });
});
