// Not shown for now: sending is turned off (server/archive/send.ts SENDING),
// and the person panel has a draft box (DraftBox.tsx) in its place. Kept for
// when sending is back.
//
// The composer under a person's chat: a text box and Send, shown only for
// their one-to-one chats on a platform friend-map can send on (Telegram,
// through the bridge rig), with how that connection is doing. It sends only
// when Send is pressed (or Ctrl/Cmd+Enter), and says how it went: sent,
// failed with the reason, or not confirmed. The sent message itself then
// comes into the chat above like any other, through sync.

import { useEffect, useState } from "react";
import type { SendResult, SendTarget } from "./archive.ts";
import { archiveApi } from "./archiveApi.ts";
import { liveStateLabel } from "./liveState.ts";
import { useNames } from "./names.ts";
import { platformName } from "./PersonParts.tsx";
import { useArchive } from "./useArchive.ts";

/** How often the composer looks at how the connection is doing, while it is shown. */
const STATE_EVERY_MS = 10_000;

export function Composers({ personId }: { personId: number }) {
  const targets = useArchive(() => archiveApi.sendTargets(personId), [personId]);
  const { reload } = targets;
  useEffect(() => {
    const timer = setInterval(reload, STATE_EVERY_MS);
    return () => clearInterval(timer);
  }, [reload]);
  if (!targets.data?.length) return null;
  return (
    <>
      {targets.data.map((target) => <Composer key={target.conversationId} target={target} several={targets.data!.length > 1} />)}
    </>
  );
}

function Composer({ target, several }: { target: SendTarget; several: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Pick<SendResult, "status" | "error"> | null>(null);
  const platform = platformName(target.platform);
  // The chat's title is often their name, so it goes with names.
  const title = useNames().hidden ? null : target.title;
  const { text: stateText, canSend } = liveStateLabel(target.state, platform);

  const send = async () => {
    if (!canSend || sending || text.trim() === "") return;
    setSending(true);
    setResult(null);
    try {
      const sent = await archiveApi.send(target.conversationId, text);
      setResult(sent);
      if (sent.status === "sent") setText("");
    } catch (error) {
      setResult({ status: "failed", error: error instanceof Error ? error.message.replace(/^POST \S+ failed \(\d+\): /, "") : String(error) });
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label className="composer__label muted" htmlFor={`composer-${target.conversationId}`}>
        Send on {platform}{several && title ? ` (${title})` : ""}
        <span className={`composer__state${canSend ? " composer__state--ok" : ""}`}> · {stateText}</span>
      </label>
      <textarea
        id={`composer-${target.conversationId}`}
        className="composer__text"
        rows={2}
        value={text}
        disabled={!canSend || sending}
        placeholder={canSend ? `Message on ${platform}` : ""}
        onChange={(e) => {
          setText(e.target.value);
          if (result?.status === "sent") setResult(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="composer__row">
        <span className={`composer__result composer__result--${result?.status ?? "none"}`} role="status">
          {sending ? "Sending…" : result ? resultLabel(result) : ""}
        </span>
        <button type="submit" className="button button--primary" disabled={!canSend || sending || text.trim() === ""}>
          Send
        </button>
      </div>
    </form>
  );
}

function resultLabel(result: Pick<SendResult, "status" | "error">): string {
  if (result.status === "sent") return "Sent";
  if (result.status === "unconfirmed") return `Not confirmed${result.error ? `: ${result.error}` : ""}; check the chat before sending again`;
  return `Failed${result.error ? `: ${result.error}` : ""}`;
}
