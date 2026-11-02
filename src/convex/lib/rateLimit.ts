/**
 * Deterministic token-bucket maths, kept separate from Convex so the boundary
 * behaviour can be tested without wall-clock sleeps.
 */
export type TokenBucket = {
  tokens: number;
  updatedAt: number;
};

export type TokenBucketResult = {
  allowed: boolean;
  tokens: number;
  updatedAt: number;
  retryAfterMs: number;
};

export function takeToken(
  bucket: TokenBucket | null,
  capacity: number,
  windowMs: number,
  now: number,
  cost = 1,
): TokenBucketResult {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("Token bucket capacity must be positive.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Token bucket window must be positive.");
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("Token cost must be positive.");
  }

  const state: TokenBucket = bucket
    ? {
        tokens: Math.min(Math.max(bucket.tokens, 0), capacity),
        updatedAt: bucket.updatedAt,
      }
    : { tokens: capacity, updatedAt: now };

  const elapsed = Math.max(0, now - state.updatedAt);
  const refilled = Math.min(
    capacity,
    state.tokens + (elapsed * capacity) / windowMs,
  );
  const tokens = Math.max(0, refilled);

  if (tokens + Number.EPSILON >= cost) {
    return {
      allowed: true,
      tokens: Math.max(0, tokens - cost),
      updatedAt: now,
      retryAfterMs: 0,
    };
  }

  const missing = cost - tokens;
  return {
    allowed: false,
    tokens,
    updatedAt: now,
    retryAfterMs: Math.max(1, Math.ceil((missing * windowMs) / capacity)),
  };
}
