import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { securityHeadersForPath } from "../lib/security-headers";

export type StaticOptions = {
  root?: string;
  path?: string;
  rewriteRequestPath?: (path: string) => string;
};

export type StaticHandler = (options: StaticOptions) => MiddlewareHandler;

/**
 * Production app factory. The Deno-specific static handler is injected by
 * main.ts so this module can be imported and tested without a Deno runtime.
 */
export function createApp({ serveStatic }: { serveStatic: StaticHandler }) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    const headers = securityHeadersForPath(new URL(c.req.url).pathname);
    for (const [name, value] of Object.entries(headers)) {
      c.header(name, value);
    }
  });

  // 1) Serve anything in /assets/**
  app.use("/assets/*", serveStatic({ root: "./dist/assets" }));

  // 2) Catch all other files in dist (CSS, JS, images, etc.)
  app.use("*", serveStatic({ root: "./dist" }));

  // 3) Fall back to index.html for the SPA
  app.get("*", serveStatic({ path: "./dist/index.html" }));

  return app;
}
