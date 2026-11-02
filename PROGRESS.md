# GeoTank AI — remediation backlog

Host note: `git`/`gh` commands are blocked by the Vly host, so automated commits are unavailable. Each item is marked DONE only when all five gates pass; this limitation is recorded rather than treating it as a product blocker.

| Item | Status | Files changed | Gate results | Notes |
|---|---|---|---|---|
| 0. Initial audit / progress ledger | DONE | `PROGRESS.md` | Baseline captured below | Backlog loaded in order; no source changes |
| 1. M1+H1 auth helper, rate limits, AI kill-switch, geocode negative cache & cleanup cron | DONE | `src/convex/lib/auth.ts`, `lib/rateLimit.ts`, `lib/limits.ts`, `lib/negativeCache.ts`, `rateLimits.ts`, `schema.ts`, `crons.ts`, `geocoding.ts`, `projects.ts`, `calculations.ts`, `settings.ts`, `audit.ts`, `imagery.ts`, `files.ts`, `ai.ts`, `tests/convex-auth.test.ts`, `vitest.config.ts`, `package.json`, `bun.lock` | All five gates green; see iteration 1 log | Git commit unavailable (host blocks git); first test run failed on missing module as intended |
| 2. M2 toolbar origin guard, headers/CSP | DONE | `src/main.tsx`, `src/lib/iframe-security.ts`, `tests/iframe-security.test.ts`, `index.html`, `public/_headers`, `vite.config.ts` | All five gates green; see iteration 2 log | Toolbar file untouched; production headers deny framing |
| 3. H3 AI prompt coordinate/filename minimisation | DONE | `src/convex/lib/aiPayload.ts`, `src/convex/ai.ts`, `tests/ai-privacy.test.ts`, `README.md` | All five gates green; see iteration 3 log | Filenames removed from prompt; labels reduced; coordinate values withheld |
| 4. Lib bug batch (EXIF, windowDays, density, coordinates, dates, report) | DONE | `src/lib/exif.ts`, `src/lib/catalogue.ts`, `src/lib/tank-geometry.ts`, `src/lib/report.ts`, `src/lib/scientific-validation.ts`, `scripts/verify-math.ts` | All five gates green; final cumulative output in iteration 4+5 log | 39 engine checks (was 32); no scope creep |
| 5. H2+M3+M8+M5 server-side STAC/upload finalisation, pending uploads, schema validation | DONE | `src/convex/projects.ts`, `files.ts`, `upload.ts`, `schema.ts`, `validators.ts`, `crons.ts`, `src/lib/image-header.ts`, `src/lib/catalogue.ts`, `src/lib/scientific-validation.ts`, `src/pages/workspace/Research.tsx`, `tests/image-header.test.ts`, `tests/upload-flow.test.ts`, `scripts/verify-live.ts`, `scripts/verify-math.ts` | All five gates green; see iteration 4+5 log | 22 vitest tests; 29 live checks green; third allowlisted host `datahub.creodias.eu` is required for CDSE quicklooks |
| 6. M7 cloud WARN, evidence vs scope-limit checks | DONE | `src/lib/scientific-validation.ts`, `src/components/workspace/ValidationList.tsx`, `src/pages/workspace/Project.tsx`, `src/convex/validators.ts`, `scripts/verify-math.ts` | All five gates green; see iteration 6 log | Cloud >30% is a tile-level WARN; overall status counts evidence checks only |
| 7. M4+L6 paginated export/delete/history | DONE | `src/convex/settings.ts`, `schema.ts`, `projects.ts`, `calculations.ts`, `src/pages/workspace/Settings.tsx`, `src/pages/workspace/History.tsx`, `tests/data-controls.test.ts`, `scripts/verify-live.ts` | All five gates green; see iteration 7 log | Export pages projects/calculations separately; deletion is scheduled and pollable; History loads more |
| 8. Misc: ai.status query, AI post-filter/cooldown, dead files, lockfile, CI, docs | DONE (host-limited docs) | `src/convex/aiStatus.ts`, `lib/aiConfig.ts`, `lib/aiGuard.ts`, `ai.ts`, `lib/limits.ts`, `src/pages/workspace/Settings.tsx`, `Project.tsx`, `tests/ai-guard.test.ts`, `tests/ai-status-cooldown.test.ts`, `scripts/verify-live.ts`, `.github/workflows/ci.yml`, `integrations.md`, `README.md`; removed `src/instrumentation.tsx`, `src/lib/vly-integrations.ts`, `sst-env.d.ts`, `package-lock.json` | All five gates green; see iteration 8 log | `.env.example` could not be edited: host blocks all `.env*` writes; documented below |

## Iteration log

### Iteration 0 — baseline

Commands inspected: repository tree, `package.json`, `src/convex/schema.ts`, `PROGRESS.md` (missing).
Baseline checks from the prior delivery: `bun tsc -b --noEmit` pass, `bun run lint` 0 errors, `bun run test:engine` 32/32. `vitest`/`convex-test` are absent, so gate 4 cannot run until iteration 1 adds them.

### Iteration 1 — M1+H1 auth, limits, kill switch, geocode cache

Test-first evidence: `tests/convex-auth.test.ts` initially failed with `Cannot find module '../src/convex/lib/negative-cache'` before implementation.

Gate output (final run, after the only lint fix — removing an unused `ConvexError` import):

**1. `bun tsc -b --noEmit`** (exit 0; no output)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ EXIF parser fails safely on non-JPEG and truncated input
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates

32 passed, 0 failed, 32 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  03:17:04
   Duration  556ms (tests 54%, import 28%, transform 17%, worker 1%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-BjEz_HoJ.js          483.71 kB │ gzip: 150.63 kB
✓ built in 8.19s
```

Notes: `vitest@5.0.5` and `convex-test@0.0.50` added (the only permitted dependencies). `convex-test@0.0.50` is the latest release compatible with the existing `convex@1.42.1` peer range. Rate-limit rows are keyed buckets and do not store query text. Geocoding limits apply after local coordinate parsing, so coordinate entry does not consume Nominatim quota.

### Iteration 2 — M2 iframe/toolbar hardening and headers

Test-first evidence: `tests/iframe-security.test.ts` initially failed with `Cannot find module '../src/lib/iframe-security'`. Three origin-allowlist tests now pass.

Gate output:

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates

32 passed, 0 failed, 32 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  03:20:22
   Duration  575ms (tests 45%, import 35%, transform 18%, worker 1%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CKduFYLk.js          484.50 kB │ gzip: 150.93 kB
✓ built in 8.53s
```

Notes: there is no `src/main.ts`; Vite's entry is `src/main.tsx`, so CSP/referrer metadata went into `index.html`, server/preview headers into `vite.config.ts`, and host headers into `public/_headers`. Published responses deny framing and use `X-Frame-Options: DENY`; the dev server allows only Vly/Freebuff ancestors so the preview remains usable. `vly-toolbar-readonly.tsx` was not edited; it is now mounted only in DEV or on `*.vly.sh`.

### Iteration 3 — H3 AI prompt minimisation

Test-first evidence: `tests/ai-privacy.test.ts` initially failed on the missing `lib/aiPayload` module. It now covers coordinate labels, last-two-component labels, and the complete prompt payload.

Gate output:

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates

32 passed, 0 failed, 32 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  3 passed (3)
      Tests  14 passed (14)
   Start at  03:22:48
   Duration  736ms (tests 50%, import 31%, transform 17%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CKduFYLk.js          484.50 kB │ gzip: 150.93 kB
✓ built in 8.45s
```

Notes: `buildAiPayload` is now the single prompt-input builder. The README claim was replaced with the exact minimisation behaviour. `privateLocationLabel` also detects coordinate-shaped labels if a client spoofs the source string.

### Iteration 4 — lib correctness batch

New engine checks were added to `scripts/verify-math.ts` before the implementation and covered: no-APP1 EXIF vs truncated JPEG, non-finite `windowDays`, strict decimal density input, coordinate sign/hemisphere conflicts, the 2015-06-23 Sentinel-2 lower bound, safe unit lookup, and report engine/window/input wording. The engine suite grew from 32 to 37 checks at this point.

Implemented: `parseJpegExif` distinguishes absent APP1 from truncated EXIF and no longer describes absent EXIF as a capture-date source; `normalizeWindowDays` is finite-only and nullable through search; density parsing uses the strict decimal grammar (rejecting `0x`/`0b`/`0o`); coordinate parsing rejects sign/hemisphere conflicts; capture dates before Sentinel-2 availability are rejected; `isLengthUnit` uses `Object.hasOwn` via a target-lib-safe cast; report section 9 uses the actual window classification and section 10 prints entered inputs with stored calculation versions.

At item-4 completion the gates were tsc 0, lint 0 (17 warnings), engine 37/37, vitest 14/14 (3 files), build 0. The final cumulative run below re-ran every gate after item 5 and stayed green, so these fixes remain covered by the checked tree.

### Iteration 5 — server-owned catalogue fetch and upload finalisation

Test-first evidence: `tests/upload-flow.test.ts` was written before the implementation; the first run failed (the helper itself had a syntax error, then the pending-upload/content-type path was missing). After fixing the helper the suite exposed that `convex-test` does not populate `_storage.contentType`; `registerUpload` now accepts an optional preliminary type, while `finalizeUpload` still derives the authoritative type from magic bytes. The suite now passes 5 tests: server-side STAC fetch, forged upload metadata ignored, duplicate storage rejection, cross-user finalisation rejection, and stale-blob purge.

Implemented: `projects.createFromScene` is an action taking only `itemId`/`collectionId`, fetching the STAC item server-side with a 25 s timeout and storing via `createFromSceneInternal`; `pendingUploads` with owner/index; `files.registerUpload/getPending/isStorageReferenced/deletePending`; hourly `purgeUnfinalisedUploads`; Node `upload.finalizeUpload` verifies size, magic bytes, header dimensions (≤50 MP), EXIF, and SHA-256, rejects duplicate storage, and deletes the blob on failure when it is not referenced; `schemaValidation: true`; bounded geometry and URL allowlists. Stored URLs must be HTTPS on `dataspace.copernicus.eu`, `sentinels.copernicus.eu`, or the CDSE quicklook CDN `datahub.creodias.eu`; unknown/`s3://` assets are dropped. The client no longer sends scene/upload verification fields.

Final cumulative gate output (run after the last code change):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

39 passed, 0 failed, 39 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  5 passed (5)
      Tests  22 passed (22)
   Start at  03:51:15
   Duration  1.32s (tests 48%, import 34%, transform 16%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-C6jgWYch.js         35.02 kB │ gzip:  10.75 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DFvgT5Fy.js          484.50 kB │ gzip: 150.92 kB
✓ built in 8.94s
```

Live integration check (not a gate): `CONVEX_URL=https://acoustic-opossum-370.convex.cloud bun run scripts/verify-live.ts` — 29 checks passed, including server-side scene creation, signed upload registration, server finalisation, 1 px dimension warning, provenance NOT VERIFIED, and cleanup. Convex functions pushed successfully at 03:49:15.

### Iteration 6 — M7 cloud WARN and evidence/scope-limit split

Regression coverage added in `scripts/verify-math.ts`: high tile-level cloud cover must be `WARN` (not `FAIL`), must be tagged `evidence`, and its wording must say it is not a target measurement; every scene check must carry one of the two kinds, and a synthetic `FAIL` scope limit must not change `overallStatus`. The high-cloud assertion encodes the prior `FAIL` behaviour and would have failed before this change; coverage was written alongside the implementation rather than executed first, which is a process deviation recorded here.

Implemented: `ValidationCheck.kind` (`evidence` | `scope-limit`); all generated checks tagged; `overallStatus` filters scope limits before aggregating; cloud >30% is a `WARN` describing provider-reported tile-level cover, not a scene-suitability failure; `Project.tsx` quality summary follows the same rule. `ValidationList` renders evidence and scope limits in separate sections, with legacy records lacking `kind` treated as evidence. The Convex `checkValidator` accepts the field as optional for pre-split records.

Gate output (exit details):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  5 passed (5)
      Tests  22 passed (22)
   Start at  04:02:09
   Duration  1.29s (tests 44%, import 34%, transform 19%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-CpejT7xe.js         35.77 kB │ gzip:  10.88 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DL828sWV.js          484.50 kB │ gzip: 150.93 kB
✓ built in 8.90s
```

Convex functions pushed successfully at 04:02:58.

### Iteration 7 — paginated export, scheduled deletion, History load more

Test-first evidence: `tests/data-controls.test.ts` was added before the backend changes. Its first run failed with `Validator error: Unexpected field \`limit\`` for `exportData` and `expected 'ok' to be 'running'` for `deleteAll`. The tests now pass, including three project pages at limit 1, two calculation pages, a completed deletion job with exact counts, cross-user isolation, and pending-blob cleanup.

Implemented: `settings.exportData` paginates one table per call (`table: "projects" | "calculations"`, opaque cursor, 1–200 rows, `isDone`). Convex permits only one paginated query per function; the first implementation attempted both in one call and the live check failed with that exact error, so the final API returns one table page at a time and the client walks both sequences. `deletionJobs` records running/complete status and counts; `settings.deleteAll` schedules bounded internal batches (25 projects, 50 calculations/uploads/logs per transaction), and `settings.deletionStatus` lets the Settings UI report committed counts instead of claiming immediate completion. History now loads 40 rows at a time up to 200 for both records and calculations. The live script walks export pages and polls the deletion job.

Final gate output (after the last lint fix to a test literal):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  6 passed (6)
      Tests  24 passed (24)
   Start at  04:17:55
   Duration  1.65s (tests 42%, import 36%, transform 18%, worker 2%, environment 1%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-BwTH6tsX.js         35.77 kB │ gzip:  10.88 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-BIKzpB7D.js          484.50 kB │ gzip: 150.92 kB
✓ built in 8.31s
```

Live integration check (not a gate): `CONVEX_URL=https://acoustic-opossum-370.convex.cloud bun run scripts/verify-live.ts` — 31 checks passed, including 5 export pages without truncation, a running deletion job, a completed job with counts (2 projects, 1 image, 1 calculation, 5 audit entries), and empty records afterward. Convex functions pushed successfully at 04:16:08.

### Iteration 8 — AI query/guards, cleanup, CI and docs

Test-first evidence: `tests/ai-guard.test.ts` and `tests/ai-status-cooldown.test.ts` were added before the final implementation integration. The guard test initially failed on the `"Inventory is low"` case; the inventory pattern was narrowed/extended and all four guard tests passed. The cooldown test verifies one model call per project, then a rejected second call within the same 60 s bucket. The status query test verifies authenticated access and unauthenticated rejection.

Implemented: AI availability moved from a Node action to the V8 query `api.aiStatus.status` (`aiStatus.ts` plus shared `aiConfig.ts`); `ai.ts` retains only the Node-runtime interpretation action. Added `lib/aiGuard.ts`, which rejects any numeric volume/length/percentage statement and affirmative liquid-level/fill/inventory claims while allowing explicit negative limitations; rejected output is audited and never stored. Added a 60 s per-project token-bucket cooldown before the hourly/daily AI limits. Removed the unused `src/instrumentation.tsx`, `src/lib/vly-integrations.ts`, `sst-env.d.ts`; removed `package-lock.json` and retained `bun.lock`; added `.github/workflows/ci.yml` with frozen Bun install, tsc, lint, engine tests and Vitest; replaced the stale `integrations.md`; refreshed README/Settings verification claims. `scripts/verify-live.ts` now uses the status query.

Gate output:

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  8 passed (8)
      Tests  31 passed (31)
   Start at  04:25:47
   Duration  2.00s (tests 46%, import 35%, transform 18%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-D_78zrTu.js         35.52 kB │ gzip:  10.78 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-phG4BG2y.js          484.50 kB │ gzip: 150.93 kB
✓ built in 8.79s
```

Live integration check (not a gate): 31 live checks passed against the development deployment, including the AI status query and the unchanged live AI interpretation path. Convex functions pushed successfully at 04:26:22.

Host limitation: `.env.example` was not changed. The Vly host rejects every write to `.env*` as a sensitive file, and the task's hard rule also forbids editing `.env*`. The template therefore still lists only `VITE_CONVEX_URL`, `CONVEX_SITE_URL` and `CONVEX_DEPLOYMENT`; the optional server-side variables (`VLY_INTEGRATION_KEY`, `VLY_INTEGRATION_BASE_URL`, `AI_ENABLED`, `AI_DAILY_CAP`, `CDSE_STAC_TOKEN`, `CONVEX_URL`) are documented in `integrations.md` and `README.md` instead.

## Verification pass

Read this table at the start of every iteration. One backlog item is worked at a time. `PROGRESS.md` is the change ledger because the host blocks `git`/`gh`.

| Item | Status | Files changed | Gate results | Evidence |
|---|---|---|---|---|
| V1. Security headers | DONE | `main.ts`, `src/lib/security-headers.ts`, `tests/security-headers.test.ts`, `index.html`; removed `public/_headers` | tsc 0; lint 0 errors; engine 40/40; Vitest 33/33; build 0 | Hono middleware applies tested CSP/baseline headers; asset cache only under `/assets/`; built HTML has no inline script |
| V2. AI output guard | DONE | `src/convex/lib/aiGuard.ts`, `src/convex/ai.ts`, `tests/ai-guard.test.ts` | tsc 0; lint 0 errors; engine 40/40; Vitest 34/34; build 0; Convex pushed 07:58:46 | Input-backed numeric values pass; unsupported numbers and fill/inventory claims fail |
| V3. Cost caps | DONE | `src/convex/lib/limits.ts`, `src/convex/files.ts`, `tests/limits.test.ts` | tsc 0; lint 0 errors; engine 40/40; Vitest 37/37; build 0; Convex pushed 08:02:30 | All finite defaults printed below; invalid overrides fall back; global imagery and upload daily caps wired |
| V4. Old records | DONE | `src/lib/scientific-validation.ts`, `src/components/workspace/ValidationList.tsx`, `src/convex/validators.ts`, `scripts/verify-math.ts` | tsc 0; lint 0 errors; engine 41/41; Vitest 37/37; build 0; Convex pushed 08:05:12 | `kind` already optional; old records now classify scope limits by stable id; schema push succeeded |
| V5. URL allowlist | DONE | `src/lib/catalogue.ts`, `scripts/verify-math.ts` | tsc 0; lint 0 errors; engine 41/41; Vitest 37/37; build 0 | CREODIAS is now an exact host; all five required cases pass, plus a lookalike subdomain |
| V6. Delete-all wording | DONE | `src/pages/workspace/Settings.tsx`, `README.md`, `tests/data-controls.test.ts` | tsc 0; lint 0 errors; engine 41/41; Vitest 37/37; build 0 | Settings and README say account/email remain; test confirms the user row survives |
| V7. Typed errors | NOT-NEEDED | none | No change; V6 gates remain green | Exact search returned zero hits; UI branches on typed status/kind fields |
| V8. Caveat lock | DONE | `scripts/verify-math.ts`, `src/lib/report.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 37/37; build 0 | Scene and upload reports pass six plain-language caveat matchers; AI-status gap fixed |
| V9. Final proof | DONE | `README.md`, `src/pages/workspace/Settings.tsx` (verification counts only) | tsc 0; lint 0 errors; engine 42/42; Vitest 37/37; build 0; Convex pushed 08:13:06 | Live script: 31 checks passed against `https://acoustic-opossum-370.convex.cloud` |

### Verification iteration 0 — ledger created

No source files changed. All nine items started as TODO. The prior copy pass is complete; the host still blocks `git`/`gh`, and `.env*` files remain off limits.

### Verification iteration 1 — V1 evidence

- `main.ts` is the production server: a Deno Hono app serving `./dist`, `./dist/assets`, and the SPA fallback. It sets no response headers.
- `package.json` has `dev`, `build`, and `preview` scripts but no production `start` script; the production entry is `main.ts`.
- `vite.config.ts` sets headers only for the Vite dev and preview servers. Those headers do not apply to `main.ts`.
- `public/_headers` exists and is copied into `dist/_headers`. That file is read by Netlify/Cloudflare-style hosts, not by this Hono server.
- `index.html` has a meta CSP without `frame-ancestors`. A meta CSP cannot enforce `frame-ancestors`.
- `dist/index.html` contains no inline script; the built app loads `/assets/index-*.js` as an external module. The production CSP can use `script-src 'self'` without `'unsafe-inline'`.

Test-first evidence: `tests/security-headers.test.ts` first failed with `Cannot find module '../src/lib/security-headers'`. It now passes two tests: exact CSP/baseline headers and immutable cache only for `/assets/*`.

Implementation: `src/lib/security-headers.ts` owns the production CSP and baseline headers. `main.ts` applies them with Hono middleware before static serving. `index.html` no longer repeats a weaker meta CSP, and `public/_headers` was removed because this host does not read it. `vite.config.ts` still sets dev/preview-only headers separately.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  9 passed (9)
      Tests  33 passed (33)
   Start at  07:56:57
   Duration  2.27s (import 47%, tests 33%, transform 17%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CgA313uS.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.59s
```

Built-output evidence: `dist/index.html` has one external module script and no meta CSP; `dist/_headers` and `public/_headers` no longer exist. No Convex source changed, so no Convex push was needed for V1.

### Verification iteration 2 — V2 AI output guard

Evidence: `src/convex/lib/aiGuard.ts` rejected every number carrying a volume, length or percentage unit. That blocked true statements such as “10 m resolution” and “18.66% cloud cover” even when those values were in `buildAiPayload` input. The existing test codified the over-broad behaviour.

Test-first evidence: `tests/ai-guard.test.ts` was updated to require input-backed `10 m` and `18.66%` to pass. The targeted run failed with `expected { ok: false, … } to deeply equal { ok: true }`, then passed after the guard change.

Implementation: `checkAiOutputSafety(output, input)` now collects numeric values from the exact payload sent to the model. A number with a unit is accepted only when its value appears in that input. Numbers absent from the input are rejected. Affirmative liquid-level, fill and inventory claims remain rejected even when the same number appears in the input. `ai.ts` passes the payload into the guard.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  9 passed (9)
      Tests  34 passed (34)
   Start at  07:59:15
   Duration  2.39s (import 47%, tests 37%, transform 14%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CgA313uS.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.41s
```

Convex push: `✔ 07:58:46 Convex functions ready! (7.55s)`.

### Verification iteration 3 — V3 cost caps

Evidence: `src/convex/lib/limits.ts` had fixed per-user capacities, one global geocode bucket (`1` per second), and `AI_DAILY_CAP` with a default of `100`. There was no global daily imagery-search cap and no global cap on upload registration. `generateUploadUrl` had a per-user daily cap, but a new guest account could bypass it.

Effective defaults now printed by `effectiveLimits({})`:

| Bucket | Scope | Capacity / window | Env override | Ceiling |
|---|---|---|---|---|
| `aiHourly` | per user | 10 / hour | none | — |
| `aiDaily` | per user | 100 / day (`DEFAULT_AI_DAILY_CAP`) | `AI_DAILY_CAP` | 10,000 |
| `aiProjectCooldown` | per record | 1 / 60 seconds | none | — |
| `geocodeGlobal` | global | 1 / second | `GEOCODE_GLOBAL_PER_SECOND` | 20 |
| `geocodeUserHourly` | per user | 30 / hour | none | — |
| `imagerySearchHourly` | per user | 30 / hour | none | — |
| `imagerySearchGlobalDaily` | global | 500 / day | `IMAGERY_SEARCH_GLOBAL_DAILY_CAP` | 5,000 |
| `imageryHealthHourly` | per user | 10 / hour | none | — |
| `uploadDaily` | per user | 20 / day | none | — |
| `uploadGlobalDaily` | global | 100 / day | `UPLOAD_GLOBAL_DAILY_CAP` | 1,000 |

Test-first evidence: `tests/limits.test.ts` first failed because `LIMIT_DEFAULTS` did not exist. It now covers every default, empty/space/`NaN`/`0`/negative/`Infinity`/decimal fallback, valid overrides and ceiling clamps.

Implementation: `effectiveLimits(env)` is the single source for runtime limits. `positiveIntegerOverride` requires a positive decimal integer and otherwise returns the code default. Imagery search now debits `imagery:search:global:day`; upload registration debits `upload:register:global:day` in `files.registerUpload` after validation and before the pending row is inserted.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

40 passed, 0 failed, 40 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:03:00
   Duration  2.13s (import 45%, tests 38%, transform 15%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CgA313uS.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.42s
```

Convex push: `✔ 08:02:30 Convex functions ready! (8.19s)`.

### Verification iteration 4 — V4 old records

Evidence: `checkValidator` in `src/convex/validators.ts` already had `kind: v.optional(...)`, so no schema migration was needed. However, `ValidationCheck.kind` was required in TypeScript, and `overallStatus` treated every check without `kind` as evidence. An old scope limit with `NOT MEASURABLE` could therefore change the overall status.

Test-first evidence: the new engine check “old checks without kind are classified by check id” first failed with `actual 'NOT MEASURABLE'` versus `expected 'PASS'`. It now passes.

Implementation: `kind` is optional in `ValidationCheck`. `checkKind` classifies stored checks by stable id when `kind` is missing. The known scope-limit ids are `tank-scale-measurement`, `georeferencing`, `internal-liquid-level`, `liquid-inventory`, `upload-ground-scale`, `upload-tank-measurement`, `capacity-dimensions` and `capacity-vs-inventory`. `overallStatus` and the Settings/Project `ValidationList` grouping both use it. The stale validator comment saying `schemaValidation` was disabled was corrected to match `schema.ts`.

Schema push: `bunx convex dev --once` succeeded at 08:05:12; no schema change was required because `kind` was already optional.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

41 passed, 0 failed, 41 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:05:41
   Duration  2.17s (import 44%, tests 38%, transform 15%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-Jv1qZF2M.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.32s
```

### Verification iteration 5 — V5 URL allowlist

Evidence: `isAllowedStoredUrl` required HTTPS but treated every allowlist entry as a suffix. `datahub.creodias.eu` was a named entry, yet `https://evil.datahub.creodias.eu/x` passed because it ended with `.datahub.creodias.eu`. That is wildcard matching, not an exact host.

Test-first evidence: the new case `https://evil.datahub.creodias.eu/x` failed with `true !== false`. It now passes. The required cases also pass: `https://datahub.creodias.eu/x` is accepted; `http://datahub.creodias.eu`, `https://datahub.creodias.eu.evil.com`, `https://evil.com/datahub.creodias.eu` and `https://notdatahub.creodias.eu` are rejected.

Implementation: `datahub.creodias.eu` moved to an exact-host set. `dataspace.copernicus.eu` and `sentinels.copernicus.eu` keep suffix matching for their real catalogue/licence subdomains. Protocol remains HTTPS-only.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

41 passed, 0 failed, 41 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:07:22
   Duration  2.45s (import 46%, tests 38%, transform 13%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-Jv1qZF2M.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.25s
```

No `src/convex/` file changed, so V5 did not need a Convex push.

### Verification iteration 6 — V6 delete-all wording

Evidence: `settings.deleteBatch` deletes projects, calculations, pending uploads, user settings and audit entries. It never deletes the `users` row. The Settings confirmation said only “This removes every research record, uploaded image, calculation, setting and activity entry,” and the README said “delete everything,” which could imply account deletion.

Implementation (wording only): Settings now says the sign-in account and email stay, both in the panel description and the confirmation. README now states that “Delete all” removes records, stored images, calculations, settings and activity entries but does not delete the sign-in account or email. No deletion behaviour changed. The existing deletion test now also asserts that the user row and email still exist after completion. This is a copy-only item, so no new behavioural test was required.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ file signatures are detected from magic bytes, not extensions
✓ report contains the required sections and never promotes estimates
✓ report uses stored calculation versions and prints entered inputs

41 passed, 0 failed, 41 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:09:13
   Duration  2.10s (import 46%, tests 35%, transform 16%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-BFkInHsD.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.24s
```

No `src/convex/` file changed, so V6 did not need a Convex push.

### Verification iteration 7 — V7 typed errors (NOT-NEEDED)

Evidence: ran the exact requested search:

```text
$ rg -n "message\.includes|\.message ===|\.message\.(startsWith|match)|data\.message" src
(no output; exit 1)
```

A wider review found only message construction and display, not message-text branching. For example, `Research.tsx` branches on `result.status`, `Project.tsx` branches on the AI result `status`, and typed `kind` values drive catalogue failures. No UI code decides behaviour from `message` text, so there is no branch to convert. No source file changed and no typed-code migration was needed.

### Verification iteration 8 — V8 caveat lock

Test-first evidence: added one engine check that builds a scene report/check list and an upload report/check list, then applies arrays of acceptable plain-language regexes for caveats (a)–(f). The first run failed with `scene is missing caveat f`: the report said AI cannot change a number but did not say it cannot change a status.

Implementation: report section 8 now says AI “cannot change a number or a check status.” Section 16 now says it has “no authority over numbers or check statuses.” The test checks (a) liquid level and inventory cannot be measured, (b) cloud cover is tile-level not target-level, (c) 10 m pixels make a tank only a few pixels wide, (d) upload source is not verified, (e) dates are never silently replaced, and (f) AI cannot change numbers or statuses. Scene records are required to carry a, b, c, e and f; upload records are required to carry a, d, e and f.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:12:10
   Duration  2.14s (import 46%, tests 36%, transform 16%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-D2Zh5hWH.js          484.48 kB │ gzip: 150.90 kB
✓ built in 8.53s
```

No `src/convex/` file changed, so V8 did not need a Convex push.

### Verification iteration 9 — V9 final proof

Final tree changes: `README.md` and the Settings verification ledger now report the actual 42 engine checks and 37 tests across 10 files. The pre-existing 40/31 counts were stale after V1–V8. No behaviour changed.

Convex push: `✔ 08:13:06 Convex functions ready! (8.12s)`. The later README/Settings count edit is frontend/docs only, so no second push was needed.

Final gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  08:15:14
   Duration  2.11s (import 46%, tests 35%, transform 17%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.01s
```

Live verification (not a gate): `CONVEX_URL=https://acoustic-opossum-370.convex.cloud bun run scripts/verify-live.ts` passed 31 checks. Last 5 lines:

```text
✓ all test records deleted
✓ uploaded image deleted from storage
✓ linked calculations deleted
✓ record list is empty after deletion

31 live checks passed against https://acoustic-opossum-370.convex.cloud
```

The live AI call also printed an `@vly-ai/integrations` warning about system messages in the messages field. It did not fail the call; no prompt or output was exposed. It is recorded as a known leftover and was not changed because it is outside this backlog.

Manual browser smoke test was not run. The 360 px checklist is in the final response.

## Round 3

Read this table first each iteration. No `git`/`gh`; this file is the ledger.

| Item | Status | Files | Gate results | Evidence |
|---|---|---|---|---|
| W1. Server app extraction + HTTP tests | DONE | `main.ts`, `src/server/app.ts`, `tests/server-app.test.ts`, `tsconfig.app.json`, `src/types/deno.d.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 39/39; build 0 | `app.request()` caught headers lost after static response; fixed middleware order. `main.ts` now typechecked; no Deno binary needed. |
| W2. Configurable frame-ancestors | DONE | `src/lib/security-headers.ts`, `tests/security-headers.test.ts`, `README.md` | tsc 0; lint 0 errors; engine 42/42; Vitest 41/41; build 0 | Valid HTTPS origins accepted; empty, invalid, path-bearing, mixed and `'none'`-with-origin values fall back to `'none'`; README documented |
| W3. Guest/signed-in global daily buckets | DONE | `src/convex/lib/limits.ts`, `src/convex/ai.ts`, `src/convex/imagery.ts`, `src/convex/files.ts`, `tests/limits.test.ts`, `tests/upload-flow.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 43/43; build 0; Convex pushed 08:28:53 | Guest caps 20 AI, 100 imagery, 20 upload; signed-in 200/500/100; upload integration proves guest exhaustion does not block signed-in |
| W4. Whole-token AI number guard | DONE | `src/convex/lib/aiGuard.ts`, `tests/ai-guard.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 44/44; build 0; Convex pushed 08:33:16 | Date fragments no longer supply allowed numbers; 10 m resolution still passes; written-number volume/fill claims reject; safety-net comment added |
| W5. Supported system-prompt field | DONE | `src/convex/ai.ts`, `src/convex/lib/aiConfig.ts`, `tests/ai-status-cooldown.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 45/45; build 0; Convex pushed 08:37:07 | Stub asserts `system` field and user-only `messages`; live run has no system-message warning and 31 checks pass |
| W6. Remove hard-coded test counts from UI/docs | DONE | `src/pages/workspace/Settings.tsx`, `README.md` | tsc 0; lint 0 errors; engine 42/42; Vitest 45/45; build 0 | No numeric test counts remain; copy now describes coverage only. Copy-only item; no new test. |
| W7. Final proof | DONE | `PROGRESS.md` only | tsc 0; lint 0 errors; engine 42/42; Vitest 45/45; build 0; Convex pushed 08:41:48 | Live script: 31 checks passed; AI system-message warning gone |

### Round 3 iteration 0 — ledger created

All seven items start as TODO. Hard rules: do not edit `src/convex/auth.ts`, `src/convex/users.ts`, `vly-toolbar-readonly.tsx`, or `.env*`; no new dependencies; no `git`.

### Round 3 iteration 1 — W1 evidence

- `main.ts` imports `Hono` and `serveStatic` from `hono/deno`, builds the app inline, and calls `Deno.serve`.
- `tsconfig.app.json` includes only `src` and `vly-toolbar-readonly.tsx`.
- `tsconfig.node.json` includes only `vite.config.ts`.
- Therefore `main.ts` has never been typechecked by the gate command.
- `command -v deno` returned nothing, so `deno check main.ts` is not available on this host.
- The planned test can exercise the app with Hono's `app.request()` without starting Deno or adding a dependency.

Test-first evidence: `tests/server-app.test.ts` first failed on the missing `src/server/app` module. After extraction, both request tests failed with `Content-Security-Policy: null`. This exposed a real bug: headers were set before `await next()`, so the Response returned by static middleware did not carry them. Moving header application after `next()` fixed both tests.

Implementation: `src/server/app.ts` exposes `createApp({ serveStatic })` and imports only `hono`, Hono types and the pure header function. `main.ts` is now the thin Deno wrapper. `main.ts` was added to `tsconfig.app.json`; `src/types/deno.d.ts` declares only the `Deno.serve(handler)` shape used by the wrapper. `bun tsc -b --noEmit` passes, so `deno check` was not needed.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  39 passed (39)
   Start at  08:24:22
   Duration  2.25s (import 45%, tests 36%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.45s
```

No `src/convex/` file changed, so W1 did not need a Convex push.

### Round 3 iteration 2 — W2 frame-ancestors

Evidence: `CONTENT_SECURITY_POLICY` contained a fixed `frame-ancestors 'none'` clause, so a deployment could not permit a trusted parent origin without editing code.

Test-first evidence: `tests/security-headers.test.ts` first failed on the missing `frameAncestorsFromEnv`. It now covers a single origin, multiple origins, `'self'`, and fallback for `undefined`, empty, whitespace, malformed, path-bearing, `javascript:`, mixed valid/invalid, and `'none'` combined with an origin.

Implementation: `FRAME_ANCESTORS` is read as a space-separated list of HTTPS origins (HTTP is accepted only for localhost). The whole value falls back to `'none'` if any token is invalid. The CSP is built per request. README documents the variable in plain English.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  41 passed (41)
   Start at  08:25:50
   Duration  2.25s (import 45%, tests 36%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.29s
```

No `src/convex/` file changed, so W2 did not need a Convex push.

### Round 3 iteration 3 — W3 guest/signed-in global caps

Evidence: imagery search and upload registration each had one global daily bucket, and AI had only per-user daily buckets. A guest could create a new account to get another per-user allowance, and all guests shared one global allowance rather than a lower guest allowance.

Test-first evidence: `tests/limits.test.ts` and `tests/upload-flow.test.ts` failed before implementation: missing guest keys, missing `audienceForUser`, and a guest’s second upload resolved instead of being rate-limited. They now pass.

Implementation: `audienceForUser` reads `isAnonymous === true` from the user row returned by `requireUser`. Global daily keys are now separate:

| Action | Guest key / default | Signed-in key / default |
|---|---|---|
| AI | `ai:global:guest:day` / 20 | `ai:global:signed-in:day` / 200 |
| Imagery search | `imagery:search:global:guest:day` / 100 | `imagery:search:global:signed-in:day` / 500 |
| Upload registration | `upload:register:global:guest:day` / 20 | `upload:register:global:signed-in:day` / 100 |

All are finite and guest limits are lower. The upload integration test exhausts the guest bucket, gets a rate-limit error, then registers successfully as a signed-in account. Existing `AI_DAILY_CAP`, `IMAGERY_SEARCH_GLOBAL_DAILY_CAP` and `UPLOAD_GLOBAL_DAILY_CAP` overrides still apply to their signed-in/global buckets; new guest overrides are `AI_GUEST_GLOBAL_DAILY_CAP`, `IMAGERY_SEARCH_GUEST_GLOBAL_DAILY_CAP` and `UPLOAD_GUEST_GLOBAL_DAILY_CAP`.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  43 passed (43)
   Start at  08:29:23
   Duration  2.32s (import 43%, tests 41%, transform 13%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.56s
```

Convex push: `✔ 08:28:53 Convex functions ready! (7.22s)`.

### Round 3 iteration 4 — W4 whole-token AI number guard

Evidence: `inputNumbers` used `/-?\d+(?:\.\d+)?/g` on the serialized payload. A date such as `2024-06-10` supplied `2024`, `06` and `10` as allowed numbers, so substring matches could pass the guard. Written numbers such as “ten thousand litres” were not consistently rejected.

Test-first evidence: the new guard tests failed on `2024 m3` being accepted from a date-only input, and on `ten thousand litres` being accepted when `1000` appeared elsewhere in the input. They now pass.

Implementation: input numbers use whole-token boundaries, exclude hyphens and dots around a token, and accept comma-grouped thousands plus decimals. Output measurements also require a whole-token boundary. A small word-number list plus a written-number unit regex rejects claims such as “ten thousand litres”; `half full` remains covered by the fill-claim regex. A code comment now states clearly that this guard is a safety net, not proof.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  44 passed (44)
   Start at  08:33:49
   Duration  2.61s (import 45%, tests 36%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.35s
```

Convex push: `✔ 08:33:16 Convex functions ready! (7.7s)`.

### Round 3 iteration 5 — W5 supported system-prompt field

Evidence: `node_modules/@vly-ai/integrations/dist/index.d.ts` exposes `AICompletionRequest.messages` with a `system` role, but no `system` or `allowSystemInMessages` field. Its `completion()` calls AI SDK `generateText({ messages })`, which emits the warning. The installed AI SDK `generateText` type supports a top-level `system` field and `allowSystemInMessages`.

Test-first evidence: `tests/ai-status-cooldown.test.ts` was switched to a `generateText` stub. It failed while `ai.ts` still called `completion`, then passed. The test asserts the system prompt is in `request.system`, all `request.messages` roles are `user`, and the system text is absent from the serialized messages.

Implementation: `ai.ts` gets the provider through `client.ai.getProvider()`, creates the configured model, and calls AI SDK `generateText` with `system: SYSTEM_PROMPT` and one user message. The adapter label now says `AI SDK generateText`; stored credits are `null` because the direct SDK call does not return the integration credit count. No new dependency was added; `ai` was already installed as the integration package's dependency.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  45 passed (45)
   Start at  08:37:42
   Duration  2.76s (import 44%, tests 38%, transform 15%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-CfnA0na_.js          484.48 kB │ gzip: 150.91 kB
✓ built in 9.20s
```

Convex push: `✔ 08:37:07 Convex functions ready! (7.53s)`.

Live run: 31 checks passed. The previous `@vly-ai/integrations` system-message warning did not appear. Last 5 lines:

```text
✓ linked calculations deleted
✓ record list is empty after deletion

31 live checks passed against https://acoustic-opossum-370.convex.cloud
```

### Round 3 iteration 6 — W6 remove hard-coded test counts

Evidence: Settings said “42 fixed checks” and “37-test suite”; README said “42 deterministic checks”, “42 passed”, “37 passed across 10 Vitest files” and “31 live checks passed”. These would go stale whenever coverage changes.

Implementation (copy only): Settings now describes what the fixed checks and separate test suite cover, with no counts. README command comments describe coverage, and “Last verified results” now says the engine suite, Vitest suite and live script passed without counts. No numbers were replaced with other numbers. `rg` finds no numeric test counts in either file; remaining `/40` matches are Tailwind opacity classes.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  45 passed (45)
   Start at  08:40:16
   Duration  2.28s (import 43%, tests 37%, transform 17%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DGJFajaI.js          484.48 kB │ gzip: 150.92 kB
✓ built in 9.03s
```

No `src/convex/` file changed, so W6 did not need a Convex push.

### Round 3 iteration 7 — W7 final proof

Final tree includes W1–W6. Convex push succeeded at 08:41:48. All five gates passed again after the last source change. Live verification passed 31 checks against `https://acoustic-opossum-370.convex.cloud`; the previous AI system-message warning was absent.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  45 passed (45)
   Start at  08:42:22
   Duration  2.32s (import 44%, tests 37%, transform 16%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DGJFajaI.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.36s
```

Live verification (not a gate): 31 checks passed. Last 5 lines:

```text
✓ all test records deleted
✓ uploaded image deleted from storage
✓ linked calculations deleted
✓ record list is empty after deletion

31 live checks passed against https://acoustic-opossum-370.convex.cloud
```

Local HEAD smoke with the real Hono Bun static adapter: `HEAD /` returned 200 with the CSP and no cache header; `HEAD /assets/index-DGJFajaI.js` returned 200 with the CSP and `Cache-Control: public, max-age=31536000, immutable`. This is an in-process check, not an HTTP request to the deployed server.

No browser and no real HTTP request to the deployed static server were run. The post-deploy `curl -I` check is in the final response.

## Round 4

Read this table first each iteration. No `git`/`gh`; this file is the ledger.

| Item | Status | Files | Gate results | Evidence |
|---|---|---|---|---|
| X1. Revalidate document responses | DONE | `src/lib/security-headers.ts`, `tests/server-app.test.ts`, `tests/security-headers.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 46/46; build 0 | `/`, `/some/deep/route` and all non-asset paths return `Cache-Control: no-cache`; `/assets/*` remains immutable |
| X2. Email code send limits | DONE | `src/convex/auth/emailOtp.ts`, `tests/email-otp-limit.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 50/50; build 0; Convex pushed 09:00:44 | 5 per address per hour plus 500 per day globally; no gateway POST on denial |
| X3. Header-first image pixel cap | DONE | `src/lib/image-quality.ts`, `src/pages/workspace/Research.tsx`, `tests/image-pixel-limit.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 53/53; build 0 | 24-byte PNG header claiming 60 MP is refused with no `createImageBitmap` call; Research checks before decode too |
| X4. UTC date wording | DONE | `src/pages/workspace/Research.tsx`, `src/pages/workspace/Project.tsx`, `src/lib/report.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 53/53; build 0 | Picker, result/status labels, Project fields and report sections 3–4 say “UTC date”; picker/report state the UTC-day match rule |
| X5. Truncated search results | DONE | `src/lib/catalogue.ts`, `src/convex/imagery.ts`, `src/pages/workspace/Research.tsx`, `tests/imagery-truncation.test.ts` | tsc 0; lint 0 errors; engine 42/42; Vitest 58/58; build 0; Convex pushed 09:08:44 | Provider `next` link or 24 returned features sets `truncated: true`; notice shown; truncated empty response has no empty-state panel |
| X6. Effective limit table | DONE | `README.md` | tsc 0; lint 0 errors; engine 42/42; Vitest 58/58; build 0 | One table lists every rate limit, fixed search/upload bound, ceiling and env var default; no values changed |
| X7. Final proof | DONE | `PROGRESS.md` | tsc 0; lint 0 errors; engine 42/42; Vitest 58/58; build 0; Convex pushed 09:12:29 | Live script: 31/31 against `https://acoustic-opossum-370.convex.cloud` |

### Round 4 iteration 0 — ledger created

All seven items start as TODO. Hard rules: do not edit `src/convex/auth.ts`, `src/convex/users.ts`, `vly-toolbar-readonly.tsx`, or `.env*`; no new dependencies; no `git`; one item per iteration.

### Round 4 iteration 1 — X1 document revalidation

Evidence before the change: `securityHeadersForPath` only set `Cache-Control` for paths starting with `/assets/`; every other response, including the SPA fallback, had no cache directive. The production `createApp` served those responses unchanged.

Test-first evidence: the request tests asserted `Cache-Control: no-cache` for `/`, `/some/deep/route` and the document response, and the header test did the same for `/workspace`, `/assets` and `/assets-extra/file.js`. The focused run failed five times with `expected undefined/null to be 'no-cache'`. The test helper was also corrected to call `await next()` so the SPA fallback was genuinely exercised; the cache assertions still failed until the header function changed.

Implementation: non-asset paths now receive `Cache-Control: no-cache`; `/assets/*` keeps `public, max-age=31536000, immutable`. No value was otherwise changed.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  11 passed (11)
      Tests  46 passed (46)
   Start at  08:58:36
   Duration  2.34s (tests 46%, import 36%, transform 16%, worker 2%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-O1dpEBp4.js         35.03 kB │ gzip:  10.60 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DGJFajaI.js          484.48 kB │ gzip: 150.92 kB
✓ built in 9.13s
```

No `src/convex/` file changed, so X1 did not need a Convex push.

### Round 4 iteration 2 — X2 email code send limits

Evidence: `src/convex/auth/emailOtp.ts` sent every requested code straight to the gateway, with no address or global counter. The read-only `src/convex/auth.ts` only registers the provider, so it did not need to change.

Provider investigation: the installed `@convex-dev/auth@0.0.90` runtime calls `sendVerificationRequest` with the Convex action context as a second argument in `dist/server/implementation/signIn.js` (the library marks that argument with `@ts-expect-error` because its public type omits it). `generateVerificationToken` has no context and cannot write to the database. The smallest correct place is therefore `sendVerificationRequest` in the editable `emailOtp.ts`, calling the existing internal `rateLimits.consume` mutation through that runtime context.

Test-first evidence: `tests/email-otp-limit.test.ts` first failed all four cases. The allowed case showed zero `runMutation` calls, and the three denial cases resolved instead of rejecting. After implementation all four pass. The test also asserts that the per-address key does not contain the raw email address and that no gateway POST occurs when either bucket denies.

Implementation: the address bucket allows 5 sends per hour and is keyed by a SHA-256 digest of the normalized address. The global bucket allows 500 sends per day. If the runtime context is ever absent, the provider refuses to send rather than bypassing the limit. Only `emailOtp.ts` changed under `src/convex/`; `auth.ts` and `users.ts` were not edited.

Convex push: `✔ 09:00:44 Convex functions ready! (7.82s)`.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  12 passed (12)
      Tests  50 passed (50)
   Start at  09:01:38
   Duration  2.48s (import 45%, tests 37%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-O1dpEBp4.js         35.03 kB │ gzip:  10.60 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DGJFajaI.js          484.48 kB │ gzip: 150.92 kB
✓ built in 8.55s
```

Live sign-in email delivery was not exercised because that would send a real code. The deny-before-send behaviour is covered by the unit tests.

### Round 4 iteration 3 — X3 header-first image pixel cap

Evidence: `src/convex/upload.ts` already enforced the 50 MP ceiling from the stored file header, but the browser path called `createImageBitmap(file)` in `analyzeImageQuality` before reading any size. A decompression bomb could therefore allocate a large bitmap before the server ever saw the upload. `Research.tsx` called that decode immediately after the signature check.

Test-first evidence: `tests/image-pixel-limit.test.ts` first failed because `checkImagePixelLimit` did not exist. The decode test also showed the current path producing the generic decode error after `createImageBitmap` was called. After implementation all three tests pass: a 24-byte PNG header claiming 10,000 × 6,000 is refused, a 10,000 × 5,000 header is accepted as exactly 50 MP, a bad header is refused, and the decode spy is not called for the oversized image.

Implementation: `checkImagePixelLimit` reads the file bytes and uses the existing `parseImageHeader`; it never invokes a decoder. It returns the plain message “This image is 10000 × 6000 pixels. The limit is 50 megapixels, so it was not opened.” `analyzeImageQuality` calls it before `createImageBitmap`, and the Research upload handler calls it after the signature check and before quality analysis. Both paths stop before decode.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  13 passed (13)
      Tests  53 passed (53)
   Start at  09:03:46
   Duration  2.50s (import 45%, tests 36%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-Dbxhxski.js         35.03 kB │ gzip:  10.60 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-Pfl6Iju4.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.07s
```

No `src/convex/` file changed, so X3 did not need a Convex push.

### Round 4 iteration 4 — X4 UTC date wording

Evidence: the date picker was labelled “Image capture date”; result labels used “exact date”, “different capture date” and “date range”; Project used “date you asked for” and “image captured”; report headings 3 and 4 did not say UTC. The underlying search already converts the entered date to one UTC day, so the copy did not match the behaviour.

Implementation (copy only): Research now labels the picker “Image capture date (UTC date)”, the summary “UTC capture date”, result matches “exact UTC date match” / “different UTC date”, and date ranges as UTC date ranges. Project labels the requested date and captured date with UTC. Report sections 3 and 4 are “UTC date you asked for” and “When the image was captured (UTC)”, with capture-date lines marked UTC. The picker and report both include the short sentence “The match uses the UTC day of the satellite pass.” No behaviour changed and no test was added for copy alone.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  13 passed (13)
      Tests  53 passed (53)
   Start at  09:05:59
   Duration  2.50s (import 45%, tests 37%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-DjYBaRY9.js         35.11 kB │ gzip:  10.63 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-Dd0ShMDO.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.07s
```

No `src/convex/` file changed, so X4 did not need a Convex push.

### Round 4 iteration 5 — X5 truncated search results

Evidence: `normalizeSearchResponse` read only `features`; it discarded the FeatureCollection `links`, so a STAC `next` link was invisible. A full page of 24 results was indistinguishable from a complete short page. The action returned no truncation field, and Research used the `empty` status to render “No images for this exact search” even when the provider page was full.

Test-first evidence: `tests/imagery-truncation.test.ts` first failed all five cases: no `truncated` field, the copy helper was missing, and both action responses omitted the field. It now covers a 24-feature page, a provider `next` link, a 23-feature short page, a full page with zero exact-date matches, and both truncation messages.

Implementation: `normalizeSearchResponse` now sets `truncated` when a root `rel: "next"` link exists or the provider returned at least the requested limit (default 24); the action exposes it on both `ok` and `empty` responses and changes the note so a full page is never described as a confirmed empty result. Research shows “Showing the first 24 results. Try a shorter date range.” for a non-empty truncated result and “Copernicus returned the first 24 results. More may exist, so the app cannot say this date has no images. Try a shorter date range.” when no exact-date scene is shown. The empty-state panel is not rendered for a truncated response.

Convex push: `✔ 09:08:44 Convex functions ready! (8.51s)`.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  14 passed (14)
      Tests  58 passed (58)
   Start at  09:09:37
   Duration  2.88s (import 48%, tests 34%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-CFpty7FD.js         35.11 kB │ gzip:  10.63 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DZ6p34Rz.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.66s
```

### Round 4 iteration 6 — X6 effective limits and environment table

Evidence: the limits were split between code (`src/convex/lib/limits.ts` and the new email send limits), README prose, and integrations.md. `AI_DAILY_CAP`, `AI_ENABLED`, `FRAME_ANCESTORS`, guest/signed-in caps, per-user caps and every environment variable read by the app or live script were not printed together. Every value inspected was finite and positive, so no default or ceiling was wrong or infinite.

Implementation (docs only): README now has one “Limits and environment variables” table with the effective default, any override/ceiling, and what each item protects. It covers per-user AI/geocode/imagery/upload limits, project cooldown, guest and signed-in global caps, email code limits, fixed search/upload bounds, `AI_ENABLED`, `FRAME_ANCESTORS`, and the integration, CDSE, Convex endpoint and live-script variables. It also states that invalid overrides fall back and values above a ceiling are clamped. No runtime value changed.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  14 passed (14)
      Tests  58 passed (58)
   Start at  09:11:48
   Duration  2.82s (import 48%, tests 35%, transform 14%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-CFpty7FD.js         35.11 kB │ gzip:  10.63 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DZ6p34Rz.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.21s
```

No `src/convex/` file changed, so X6 did not need a Convex push.

### Round 4 iteration 7 — X7 final proof

No source changed in this iteration. Final Convex push: `✔ 09:12:29 Convex functions ready! (8.36s)`. All five gates passed on the final tree, and the live verification script passed 31 checks against `https://acoustic-opossum-370.convex.cloud`.

Gate output (last 5 lines):

**1. `bun tsc -b --noEmit`** (exit 0)
```
(no output — exit 0)
```

**2. `bun run lint`** (exit 0)
```
  120:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components
  130:17  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 17 problems (0 errors, 17 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```

**3. `bun run test:engine`** (exit 0)
```
✓ report contains the required sections and never promotes estimates
✓ scene and upload reports keep every plain-language caveat
✓ report uses stored calculation versions and prints entered inputs

42 passed, 0 failed, 42 total checks
```

**4. `bunx vitest run`** (exit 0)
```
 Test Files  14 passed (14)
      Tests  58 passed (58)
   Start at  09:13:21
   Duration  2.79s (import 47%, tests 35%, transform 16%, worker 3%)
```

**5. `bun run build`** (exit 0)
```
dist/assets/Project-CFpty7FD.js         35.11 kB │ gzip:  10.63 kB
dist/assets/react-vendor-CrVS4-rd.js    46.34 kB │ gzip:  16.69 kB
dist/assets/framer-motion-BGlJfi39.js  127.07 kB │ gzip:  41.84 kB
dist/assets/index-DZ6p34Rz.js          484.48 kB │ gzip: 150.91 kB
✓ built in 8.14s
```

Live verification (not a gate): 31 checks passed. Last 5 lines:

```text
✓ all test records deleted
✓ uploaded image deleted from storage
✓ linked calculations deleted
✓ record list is empty after deletion

31 live checks passed against https://acoustic-opossum-370.convex.cloud
```

The live AI adapter printed `@vly-ai/integrations@0.6.14 (AI SDK generateText)` with no system-message warning. No browser, deployed static-host HTTP check, production Convex deploy or real sign-in email send was performed.
