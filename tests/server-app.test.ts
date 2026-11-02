import { describe, expect, it } from "vitest";

import { createApp } from "../src/server/app";

const expectedCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const serveStatic = () => async () => new Response("static");

describe("production Hono app", () => {
  it("sets exact headers on the SPA root response", async () => {
    const app = createApp({ serveStatic });
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(expectedCsp);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("sets immutable caching on asset responses only", async () => {
    const app = createApp({ serveStatic });
    const asset = await app.request("/assets/x.js");
    const root = await app.request("/");

    expect(asset.headers.get("Content-Security-Policy")).toBe(expectedCsp);
    expect(asset.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(root.headers.get("Cache-Control")).toBeNull();
  });
});
