export const NEGATIVE_CACHE_TTL_MS = 60_000;

/** A negative geocoder result is reusable only inside its 60-second window. */
export function isFailureFresh(
  at: number,
  now: number,
  ttlMs = NEGATIVE_CACHE_TTL_MS,
): boolean {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false;
  const age = now - at;
  return age >= 0 && age < ttlMs;
}
