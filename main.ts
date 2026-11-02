import { serveStatic } from "hono/deno";

import { createApp } from "./src/server/app.ts";

const app = createApp({ serveStatic });

Deno.serve(app.fetch);
