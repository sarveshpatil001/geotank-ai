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
- Optional image upload with magic-byte checks, size limits, browser decoding,
  EXIF extraction, SHA-256 and server-side storage verification.
- Scientific validation ledger with a stated evidence basis and rule per check.
- Deterministic tank geometry engine (vertical and horizontal cylinders, full
  capacity only) with explicit units, validated ranges and server re-computation.
- AI commentary restricted to metadata interpretation, stored separately and
  unable to affect calculations or validation statuses.
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
src/convex/projects.ts           records, uploads, ownership
src/convex/calculations.ts       server-recomputed calculations
src/convex/ai.ts                 metadata-only AI adapter
src/convex/settings.ts           preferences, export, deletion
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
  `gpt-4o-mini`. Only metadata text is sent (no image pixels, no exact
  coordinates). Calls may bill to the deployment's integration account.

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
bun run test:engine            # 32 deterministic checks (engine, catalogue,
                               # validation rules, EXIF, report)
bun tsc -b --noEmit            # TypeScript + Convex generated types
bunx convex dev --once         # push functions / regenerate types
CONVEX_URL="https://<deployment>.convex.cloud" bun run scripts/verify-live.ts
```

Last verified results in the development deployment:

- `32 passed, 0 failed` — engine/catalogue/validation tests, including reference
  volumes, unit invariance, invalid inputs, exact-date filtering, cloud
  exclusions, upload provenance and report sections.
- `27 live checks passed` — disposable anonymous session; unauthenticated access
  rejected; live CDSE search returned a real scene; record creation; exact date
  preserved; liquid-level and image-measurement checks NOT MEASURABLE; server
  volume `62.83185307179586 m³`; linked calculation deletion; upload storage
  round-trip; AI call returned an explicit outcome; export and cleanup verified.

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
- A record's provider metadata is stored from the search response; this app does
  not re-fetch and re-verify each item on save.
- AI commentary can be wrong and is not benchmarked. It is not evidence.
- The app is a responsive web app/PWA manifest; offline caching is not implemented.

## Privacy and security

- All queries/mutations/actions check the signed-in user and record ownership.
- Uploads are limited to JPEG/PNG/WebP, 12 MiB, signature-checked in the browser
  and re-checked against Convex storage metadata on the server.
- Credentials stay in server-side environment variables; none are bundled.
- Users can export their data, delete individual records (including stored
  images) and delete everything. The activity log records actions without query
  text or pixels.

## Scope

Public educational research only. It is not facility-specific petroleum
inventory surveillance, not operational stock-change monitoring, and not a
measurement of tank contents.
