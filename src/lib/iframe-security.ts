const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Only these parent origins may drive the embedded workspace. Remote parents
 * must be HTTPS; localhost HTTP is accepted for local preview only.
 */
export function isAllowedParentOrigin(
  origin: string,
  appOrigin: string,
): boolean {
  if (!origin || origin === "null") return false;
  if (origin === appOrigin) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return true;
  if (url.protocol !== "https:") return false;

  if (url.hostname === "vly.sh" || url.hostname.endsWith(".vly.sh")) {
    return true;
  }
  if (
    url.hostname === "freebuff.com" ||
    url.hostname.endsWith(".freebuff.com")
  ) {
    return true;
  }
  return false;
}

function normalizedOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveParentOrigin(input: {
  framed: boolean;
  appOrigin: string;
  referrer: string;
  ancestorOrigin: string | null;
}): string | null {
  if (!input.framed) return input.appOrigin;

  for (const candidate of [input.ancestorOrigin, input.referrer]) {
    const origin = normalizedOrigin(candidate);
    if (origin && isAllowedParentOrigin(origin, input.appOrigin)) {
      return origin;
    }
  }
  return null;
}
