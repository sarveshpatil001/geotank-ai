import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { securityHeadersForPath } from "./src/lib/security-headers.ts";

const app = new Hono();

app.use("*", async (c, next) => {
  const headers = securityHeadersForPath(new URL(c.req.url).pathname);
  for (const [name, value] of Object.entries(headers)) {
    c.header(name, value);
  }
  await next();
});

// 1) Serve anything in /assets/**
app.use("/assets/*", serveStatic({ root: "./dist/assets" }));

// 2) Catch *all* other files in dist (CSS, JS, images, etc.)
app.use("*", serveStatic({ root: "./dist" }));

// 3) Fallback to index.html for the SPA
app.get("*", serveStatic({ path: "./dist/index.html" }));

Deno.serve(app.fetch);
