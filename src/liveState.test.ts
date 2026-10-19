import { describe, expect, it } from "vitest";
import { liveStateLabel } from "./liveState.ts";

describe("liveStateLabel", () => {
  it("lets the composer send only while connected, and says why not otherwise", () => {
    const at = (state: Parameters<typeof liveStateLabel>[0]["state"], detail: string | null = null) => liveStateLabel({ state, detail, since: 0 }, "Telegram");
    expect(at("connected")).toEqual({ text: "Telegram is connected", canSend: true });
    expect(at("waiting", "the bridge rig's homeserver does not answer")).toEqual({
      text: "the bridge rig is not running, so Telegram cannot be reached (the bridge rig's homeserver does not answer)", canSend: false,
    });
    expect(at("logged-out").canSend).toBe(false);
    expect(at("bridge-offline").text).toBe("the Telegram bridge is not running");
    expect(at("error", "it stopped").text).toBe("Telegram has an error (it stopped)");
  });
});
