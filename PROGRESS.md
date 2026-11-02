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
