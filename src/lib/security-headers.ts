export const DEFAULT_FRAME_ANCESTORS = "'none'";

function normalizeOrigin(token: string): string | null {
  if (token === "'none'" || token === "'self'") return token;

  let url: URL;
  try {
    url = new URL(token);
  } catch {
    return null;
  }

  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) return null;
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }
  return url.origin;
}

/**
 * FRAME_ANCESTORS is a space-separated list of origins. Empty, invalid or
 * mixed values fall back to the locked-down default rather than partially
 * widening the policy.
 */
export function frameAncestorsFromEnv(raw: string | undefined): string {
  if (raw === undefined) return DEFAULT_FRAME_ANCESTORS;
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return DEFAULT_FRAME_ANCESTORS;
  if (tokens.includes("'none'") && tokens.length > 1) {
    return DEFAULT_FRAME_ANCESTORS;
  }

  const normalized: string[] = [];
  for (const token of tokens) {
    const origin = normalizeOrigin(token);
    if (!origin) return DEFAULT_FRAME_ANCESTORS;
    normalized.push(origin);
  }
  return normalized.join(" ");
}

function contentSecurityPolicy(frameAncestors: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export const CONTENT_SECURITY_POLICY = contentSecurityPolicy(
  DEFAULT_FRAME_ANCESTORS,
);

/**
 * Headers for the production static server. Vite dev/preview headers are
 * separate because the hosted preview must remain embeddable.
 */
export function securityHeadersForPath(
  pathname: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(
      frameAncestorsFromEnv(env.FRAME_ANCESTORS),
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  headers["Cache-Control"] = pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";

  return headers;
}
