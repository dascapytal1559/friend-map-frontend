// The sun on Orbits, or your photo in place of it (SunPhoto.tsx), drawn to markup.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadOnly } from "../readOnly.ts";
import { PHOTO_SHARE, Sun, SunControls } from "./SunPhoto.tsx";

const sun = (photo: string | null) => renderToStaticMarkup(createElement("svg", null, createElement(Sun, { inner: 40, photo })));
const controls = (photo: string | null, readOnly = false) =>
  renderToStaticMarkup(
    createElement(ReadOnly.Provider, { value: readOnly }, createElement(SunControls, { x: 300, y: 200, inner: 40, photo, shown: true, onPhoto: () => {} })),
  );

describe("the sun", () => {
  it("with no photo, is the sun with \"you\" on it", () => {
    const html = sun(null);
    expect(html).toContain('fill="url(#orbits-sun)"');
    expect(html).toContain(">you</text>");
    expect(html).not.toContain("<image");
  });

  it("with a photo, is the photo, round, ringed, with the sun's glow round it, and no text", () => {
    const html = sun("/api/me/photo?v=1");
    expect(html).toContain('href="/api/me/photo?v=1"');
    expect(html).toContain('clip-path="url(#orbits-photo-clip)"');
    expect(html).toContain(`<circle r="${40 * PHOTO_SHARE}" class="orbits__photo-ring"`);
    expect(html).toContain('fill="url(#orbits-sun)"');
    expect(html).not.toContain("<text");
  });
});

describe("the sun's buttons", () => {
  it("offer to add a photo, and with one, to change or remove it", () => {
    expect(controls(null)).toContain('aria-label="Add a photo of you"');
    expect(controls(null)).not.toContain("Remove your photo");
    const withPhoto = controls("/api/me/photo?v=1");
    expect(withPhoto).toContain('aria-label="Change your photo"');
    expect(withPhoto).toContain('aria-label="Remove your photo"');
    expect(withPhoto).toContain('type="file"');
    expect(withPhoto).toContain("orbits-me--shown");
  });

  it("are not there when the page is read-only (demo mode and the static demo)", () => {
    expect(controls(null, true)).toBe("");
    expect(controls("/api/me/photo?v=1", true)).toBe("");
  });
});
