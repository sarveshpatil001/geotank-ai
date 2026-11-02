import { describe, expect, it } from "vitest";

import {
  isAllowedParentOrigin,
  resolveParentOrigin,
} from "../src/lib/iframe-security";

describe("iframe parent origin allow-list", () => {
  it("accepts the app origin, Vly previews and Freebuff", () => {
    expect(isAllowedParentOrigin("https://app.example", "https://app.example")).toBe(true);
    expect(isAllowedParentOrigin("https://abc.vly.sh", "https://app.example")).toBe(true);
    expect(isAllowedParentOrigin("https://vly.sh", "https://app.example")).toBe(true);
    expect(isAllowedParentOrigin("https://freebuff.com", "https://app.example")).toBe(true);
    expect(isAllowedParentOrigin("https://www.freebuff.com", "https://app.example")).toBe(true);
    expect(isAllowedParentOrigin("http://localhost:5173", "http://localhost:5173")).toBe(true);
  });

  it("rejects lookalikes, insecure remote origins and opaque origins", () => {
    expect(isAllowedParentOrigin("https://evil.com", "https://app.example")).toBe(false);
    expect(isAllowedParentOrigin("https://vly.sh.evil.com", "https://app.example")).toBe(false);
    expect(isAllowedParentOrigin("https://evil-vly.sh", "https://app.example")).toBe(false);
    expect(isAllowedParentOrigin("http://freebuff.com", "https://app.example")).toBe(false);
    expect(isAllowedParentOrigin("null", "https://app.example")).toBe(false);
    expect(isAllowedParentOrigin("", "https://app.example")).toBe(false);
  });

  it("derives a concrete parent origin instead of broadcasting", () => {
    expect(
      resolveParentOrigin({
        framed: false,
        appOrigin: "https://app.example",
        referrer: "https://evil.com/page",
        ancestorOrigin: null,
      }),
    ).toBe("https://app.example");

    expect(
      resolveParentOrigin({
        framed: true,
        appOrigin: "https://app.example",
        referrer: "https://abc.vly.sh/preview",
        ancestorOrigin: null,
      }),
    ).toBe("https://abc.vly.sh");

    expect(
      resolveParentOrigin({
        framed: true,
        appOrigin: "https://app.example",
        referrer: "",
        ancestorOrigin: "https://freebuff.com",
      }),
    ).toBe("https://freebuff.com");

    expect(
      resolveParentOrigin({
        framed: true,
        appOrigin: "https://app.example",
        referrer: "https://evil.com/",
        ancestorOrigin: "https://evil.com",
      }),
    ).toBeNull();
  });
});
