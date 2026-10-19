// Stickers in the chat: Messenger's like (the thumbs-up) inline at an emoji's
// size, other stickers whole at their own size, and photos as before.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AttachmentInfo, TimelineMessage } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { Message } from "./Timeline.tsx";

provideArchive({ attachmentUrl: (id: number) => `/attachments/${id}` } as unknown as ArchiveApi);

function attachment(over: Partial<AttachmentInfo>): AttachmentInfo {
  return { id: 1, type: "sticker", mime: "image/png", size: 5428, missing: false, like: null, ...over };
}

function drawn(...attachments: AttachmentInfo[]): string {
  const message: TimelineMessage = {
    id: 1, platform: "messenger", conversation: { id: 9, type: "direct", title: "Ada", marketplace: false },
    sentAt: 0, fromSelf: true, sender: null, type: "sticker", text: null, unsent: false, callSeconds: null, callLengthGiven: false, callNote: "", attachments, reactions: [],
  };
  return renderToStaticMarkup(createElement(Message, { message }));
}

describe("stickers", () => {
  it("draw Messenger's like inline, sized by how long it was held, with nothing to open", () => {
    for (const like of ["small", "medium", "large"] as const) {
      const html = drawn(attachment({ like }));
      expect(html).toContain(`class="attachment-like attachment-like--${like}"`);
      expect(html).toContain('alt="👍"');
      expect(html).not.toContain("attachment-image");
      expect(html).not.toContain("<button");
    }
  });

  it("show a like whose file is gone as the emoji", () => {
    const html = drawn(attachment({ like: "small", missing: true }));
    expect(html).toContain('<span class="attachment-like" title="Like">👍</span>');
    expect(html).not.toContain("not in the export");
  });

  it("draw any other sticker whole in its own box, not as a photo tile", () => {
    for (const mime of ["image/png", "image/webp"]) {
      const html = drawn(attachment({ mime }));
      expect(html).toContain('<span class="attachment-sticker"><img');
      expect(html).not.toContain("attachment-image");
      expect(html).not.toContain("attachment-like");
    }
  });

  it("leave photos as they were, and a sticker the browser cannot show as a file", () => {
    expect(drawn(attachment({ type: "image", mime: "image/jpeg" }))).toContain('class="attachment-image"');
    expect(drawn(attachment({ mime: "application/x-tgsticker" }))).toContain('<a class="attachment"');
    expect(drawn(attachment({ missing: true }))).toContain("Sticker · not in the export");
  });
});
