import { describe, expect, it } from "vitest";
import { securityHeadersForPath } from "../src/lib/security-headers";

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

describe("production security headers", () => {
  it("sets the exact content security policy and baseline headers", () => {
    const headers = securityHeadersForPath("/workspace");

    expect(headers["Content-Security-Policy"]).toBe(expectedCsp);
    expect(headers["Content-Security-Policy"]).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Cache-Control"]).toBeUndefined();
  });

  it("allows a one-year immutable cache only for fingerprinted assets", () => {
    expect(securityHeadersForPath("/assets/index-abc123.js")["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(securityHeadersForPath("/assets/index-abc123.css")["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(securityHeadersForPath("/assets/logo.svg")["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(securityHeadersForPath("/assets")["Cache-Control"]).toBeUndefined();
    expect(securityHeadersForPath("/assets-extra/file.js")["Cache-Control"]).toBeUndefined();
    expect(securityHeadersForPath("/")["Cache-Control"]).toBeUndefined();
  });
});
