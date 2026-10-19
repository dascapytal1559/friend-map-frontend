// Imported first by each entry point (npm start, npm run check-settings), so a
// wrong Node stops before anything else loads (nodeVersion.ts).

import { requirePinnedNode } from "./nodeVersion.ts";

requirePinnedNode();
