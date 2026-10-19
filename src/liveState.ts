// How a sync connector's state reads in the page (see LiveState in archive.ts).

import type { LiveState } from "./archive.ts";

/** A few words for where things stand, and whether sending works now. */
export function liveStateLabel(live: LiveState, platform: string): { text: string; canSend: boolean } {
  const detail = live.detail ? ` (${live.detail})` : "";
  switch (live.state) {
    case "connected": return { text: `${platform} is connected`, canSend: true };
    case "connecting":
    case "starting": return { text: `connecting to ${platform}…${detail}`, canSend: false };
    case "waiting": return { text: `the bridge rig is not running, so ${platform} cannot be reached${detail}`, canSend: false };
    case "logged-out": return { text: `the bridge is logged out of ${platform}${detail}`, canSend: false };
    case "bridge-offline": return { text: `the ${platform} bridge is not running${detail}`, canSend: false };
    case "off": return { text: `${platform} is switched off (npm run archive -- enable <connector>)`, canSend: false };
    case "stopped": return { text: `${platform} is stopped`, canSend: false };
    case "error": return { text: `${platform} has an error${detail}`, canSend: false };
  }
}
