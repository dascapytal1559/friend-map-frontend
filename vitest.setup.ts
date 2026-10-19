// Every test counts days and months in one zone, whatever this machine's: the one the tests and the demo's crowd are
// written for (the demo's backend names it in its handshake, DEMO_TIME_ZONE). A test of another zone sets its own.

import { setTimeZone } from "./src/time.ts";
import { DEMO_TIME_ZONE } from "./src/demo/timeZone.ts";

setTimeZone(DEMO_TIME_ZONE);
