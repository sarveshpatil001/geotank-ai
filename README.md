# Tank Calculator AI

A geospatial research workspace for Android-first browsers. It searches real
Copernicus Sentinel-2 catalogue metadata for a **location** and an **image
capture date**, records the provider's response, validates what the evidence can
and cannot support, computes ideal-cylinder tank capacity with a deterministic
engine, and produces a downloadable research report.

The guiding rule is simple: mathematical correctness before AI confidence, and
validation before any measurement claim. **This tool never claims to reveal a
tank's internal liquid level or inventory.**

## What v1 includes

- Two required inputs for imagery search: location and capture date.
- Live Copernicus Data Space Ecosystem (CDSE) STAC metadata search.
- Explicit handling of empty results vs timeout, auth, rate-limit, upstream and
  malformed responses. Dates that differ from the request are never substituted.
- Optional image upload with a pending-upload lifecycle; the server re-reads the
  stored blob and verifies size, magic bytes, header dimensions, EXIF and
  SHA-256 before finalising it into a record.
- Scientific validation ledger with a stated evidence basis and rule per check.
- Deterministic tank geometry engine (vertical and horizontal cylinders, full
  capacity only) with explicit units, validated ranges and server re-computation.
- AI commentary restricted to metadata interpretation, stored separately and
  unable to affect calculations or validation statuses. A deterministic output
  filter rejects numeric measurements and affirmative liquid-level claims.
- Research report with the 16 required sections, Markdown download and
  print/PDF via the browser.
- Project history, per-record deletion, account-scoped access control, data
  export, full data deletion and an activity log.
- Responsive workspace with a mobile bottom navigation bar and safe-area support.

## Stack and structure

Vite · React 19 · TypeScript · React Router · Tailwind v4 · shadcn/ui ·
Framer Motion · Convex (database, file storage, actions) · Convex Auth (email
OTP + anonymous).

```
src/pages/Landing.tsx            public overview
src/pages/Auth.tsx               OTP + guest sign-in
src/pages/workspace/Research.tsx location/date search + upload
src/pages/workspace/Project.tsx  viewer, metadata, AI, validation, report
src/pages/workspace/Calculator.tsx
src/pages/workspace/History.tsx
src/pages/workspace/Settings.tsx privacy, live health checks, data controls

src/lib/tank-geometry.ts         authoritative calculation engine
src/lib/catalogue.ts             STAC validation + normalisation (pure)
src/lib/scientific-validation.ts deterministic checks
src/lib/exif.ts                  defensive EXIF reader
src/lib/image-quality.ts         upload signature/statistics
src/lib/report.ts                deterministic report builder

src/convex/geocoding.ts          Nominatim + coordinate parsing, cached
src/convex/imagery.ts            CDSE STAC search + health
src/convex/projects.ts           records, server-side STAC fetch, uploads, ownership
src/convex/calculations.ts       server-recomputed calculations
src/convex/ai.ts                 metadata-only Node AI action
src/convex/aiStatus.ts           AI availability query
src/convex/lib/aiGuard.ts        deterministic model-output filter
src/convex/settings.ts           preferences, paginated export, scheduled deletion
```

## Data sources, licensing and cost

- **Copernicus Data Space Ecosystem STAC API v1** —
  `https://stac.dataspace.copernicus.eu/v1/search`. Anonymous read-only metadata
  search was verified live. Pixel assets require a Copernicus account and are
  **not** requested by this app. Sentinel data are free and open under the
  Sentinel Data Legal Notice; attribution is stored with each record.
- **OpenStreetMap Nominatim** — used for place-name geocoding only, with an
  identifying User-Agent, a 12 s timeout, low request volume and a 30-day cache.
  Attribution: © OpenStreetMap contributors, ODbL 1.0.
- **AI gateway** — the deployment's existing `@vly-ai/integrations` key, model
  `gpt-4o-mini`. Only minimised metadata text is sent: no image pixels, no
  filenames and no exact coordinates. Coordinate-sourced locations become
  "user-entered coordinates (withheld)"; geocoder labels are reduced to their
  last two comma-separated components. Calls may bill to the deployment's
  integration account.

No paid data service, map tile subscription or additional API key is required.

## Deterministic engine

Vertical cylinder: `V = π × r² × H`
Horizontal cylinder (full capacity): `V = π × r² × L`

- IEEE-754 double precision; no intermediate rounding; formatting rounds only.
- Internal dimensions only, with explicit units (`m`, `cm`, `mm`, `ft`, `in`).
- Bounds: 1 cm – 200 m per dimension; non-finite, zero and negative values are
  rejected with explicit error codes.
- Theoretical geometric capacity ≠ nominal capacity ≠ usable capacity ≠ measured
  inventory. Partial-fill calculations are deliberately **not implemented**
  until the segment geometry and reference values are validated.
- Calculated volumes are re-computed by the same engine when saved.

## Verification

Commands:

```bash
bun run test:engine            # engine, catalogue, validation rules, EXIF,
                               # upload headers and report checks
bunx vitest run                # auth, limits, uploads, paging, deletion,
                               # security headers and AI guards
bun tsc -b --noEmit            # TypeScript + Convex generated types
bunx convex dev --once         # push functions / regenerate types
CONVEX_URL="https://<deployment>.convex.cloud" bun run scripts/verify-live.ts
```

Last verified results in the development deployment:

- The engine/catalogue/validation suite passed, including reference volumes,
  unit invariance, invalid inputs, exact-date filtering, cloud exclusions,
  upload provenance and report sections.
- The Vitest suite passed, covering ownership, rate limits, upload
  finalisation, pagination, scheduled deletion, security headers and AI safety
  guards.
- The live verification script passed with a disposable anonymous session:
  unauthenticated access rejected; live CDSE search returned a real scene;
  server-side STAC item fetch; exact date preserved; liquid-level and
  image-measurement checks NOT MEASURABLE; server volume
  `62.83185307179586 m³`; linked calculation deletion; upload storage
  round-trip; paginated export; scheduled deletion; AI status query returned an
  explicit outcome.

Status meanings used throughout the app: `PASS`, `WARN`, `FAIL`,
`NOT MEASURABLE`, `NOT VERIFIED`, `NOT APPLICABLE`, plus engineering
`IMPLEMENTED`, `TESTED`, `VERIFIED`. In the Settings ledger: catalogue search is
VERIFIED, the engine and validation rules are TESTED, and uploads/report/AI are
IMPLEMENTED (browser upload and AI were exercised server-side, but the full UI
round-trip and print layout were not visually verified).

## Known limitations

- Optical satellite imagery cannot observe a tank's interior. Internal liquid
  level, fill percentage and inventory are never inferred.
- Sentinel-2 at 10 m is generally too coarse for individual small-tank geometry;
  the app marks image-derived dimensions NOT MEASURABLE.
- Cloud, shadow, viewing geometry and georeferencing affect any visual analysis;
  no independent ground control points are measured.
- Uploaded files are not authenticated satellite products. EXIF can be edited.
- Scene metadata is fetched server-side from CDSE when a record is created. Later
  views use that stored response; it is not periodically re-fetched.
- AI commentary can be wrong and is not benchmarked. It is not evidence.
- The app is a responsive web app/PWA manifest; offline caching is not implemented.

## Limits and environment variables

All rate limits are finite token buckets. An empty, zero, negative, non-integer or non-finite override falls back to the default; a value above the ceiling is clamped.

| Limit or variable | Effective default | What it protects |
|---|---|---|
| AI requests per user | 10 per hour | Stops one account draining AI credits |
| `AI_DAILY_CAP` | 100 per user per day (ceiling 10,000) | Caps daily AI spend per account |
| AI project cooldown | 1 run per 60 seconds per record | Stops repeated runs on the same record |
| Global AI daily, guest | 20 per day (`AI_GUEST_GLOBAL_DAILY_CAP`, ceiling 1,000) | Caps total guest AI spend |
| Global AI daily, signed in | 200 per day (`AI_SIGNED_IN_GLOBAL_DAILY_CAP`, ceiling 5,000) | Caps total signed-in AI spend |
| `AI_ENABLED` | On unless set to `false` (case-insensitive, trimmed) | Emergency AI cost and availability kill switch |
| Geocoding per user | 30 per hour | Protects the OpenStreetMap Nominatim service |
| `GEOCODE_GLOBAL_PER_SECOND` | 1 per second (ceiling 20) | Keeps the shared geocoder within its public-service budget |
| Imagery search per user | 30 per hour | Stops one account flooding Copernicus |
| Imagery health check per user | 10 per hour | Limits repeated upstream connectivity probes |
| Global imagery search, guest | 100 per day (`IMAGERY_SEARCH_GUEST_GLOBAL_DAILY_CAP`, ceiling 1,000) | Caps anonymous Copernicus traffic |
| Global imagery search, signed in | 500 per day (`IMAGERY_SEARCH_GLOBAL_DAILY_CAP`, ceiling 5,000) | Caps signed-in Copernicus traffic |
| Upload registration per user | 20 per day | Stops storage and finalisation abuse |
| Global uploads, guest | 20 per day (`UPLOAD_GUEST_GLOBAL_DAILY_CAP`, ceiling 500) | Caps anonymous storage use |
| Global uploads, signed in | 100 per day (`UPLOAD_GLOBAL_DAILY_CAP`, ceiling 1,000) | Caps signed-in storage use |
| Email sign-in codes per address | 5 per hour | Stops code spam to one inbox |
| Email sign-in codes globally | 500 per day | Caps total gateway email sends |
| Sign-in code lifetime | 15 minutes | Limits the window for a stolen code |
| Catalogue page | 24 results; a full page or provider `next` link is marked truncated | Prevents a partial page looking complete |
| Search area | 0.6° maximum span | Keeps STAC queries and map work bounded |
| Nearby-date window | 1–15 days, only when chosen | Prevents silent or unbounded date widening |
| Upload file size | 12 MiB | Bounds storage and server processing |
| Upload pixels | 50 megapixels, checked from the header before decode | Prevents decompression-bomb memory use |
| `FRAME_ANCESTORS` | `'none'` | Blocks clickjacking; accepts space-separated HTTPS origins |
| `VLY_INTEGRATION_KEY` | Unset | Required for AI and email-code delivery; stays server-side |
| `VLY_INTEGRATION_BASE_URL` | `https://integrations.vly.ai` | Points AI/email at the integration gateway |
| `CDSE_STAC_TOKEN` | Unset; anonymous catalogue search | Optional token for a higher Copernicus quota |
| `VITE_CONVEX_URL` | Required; no built-in fallback | Build-time Convex endpoint; the app cannot connect without it |
| `CONVEX_SITE_URL` | Required by Convex Auth; no built-in fallback | Auth callback and issuer base |
| `VLY_CONVEX_AUTH_ISSUER` | `https://freebuff.com` | Trusted auth issuer |
| `CONVEX_URL` | Required only by `scripts/verify-live.ts` | Target deployment for live verification |

## Privacy and security

- All queries/mutations/actions check the signed-in user and record ownership.
- Uploads are limited to JPEG/PNG/WebP and 12 MiB. The server re-reads the
  stored blob and verifies size, magic bytes, header dimensions (≤ 50 MP), EXIF
  and SHA-256 before creating a record; duplicate storage references are
  rejected and failed blobs are deleted.
- Credentials stay in server-side environment variables; none are bundled.
- `FRAME_ANCESTORS` controls who may embed the published app. Give a
  space-separated list of HTTPS origins. The default is `'none'`, and an empty
  or invalid value falls back to `'none'`.
- Users can export their data and delete individual records (including stored
  images). "Delete all" removes records, stored images, calculations, settings
  and activity entries. It does not delete the sign-in account or email. The
  activity log records actions without query text or pixels.

## Scope

Public educational research only. It is not facility-specific petroleum
inventory surveillance, not operational stock-change monitoring, and not a
measurement of tank contents.
