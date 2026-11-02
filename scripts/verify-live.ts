/**
 * Opt-in live integration check against the configured Convex deployment.
 *
 *   CONVEX_URL="https://<deployment>.convex.cloud" bun scripts/verify-live.ts
 *
 * It signs in with a disposable anonymous session, exercises geocoding,
 * catalogue search, record creation, calculation storage, AI status, an upload
 * round-trip and data deletion, then verifies the cleanup. It only ever deletes
 * data belonging to that disposable session.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../src/convex/_generated/api";

const url = process.env.CONVEX_URL;
if (!url) {
  console.error("CONVEX_URL is required, e.g. https://example.convex.cloud");
  process.exit(2);
}

const client = new ConvexHttpClient(url);
let checks = 0;

function ok(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`✓ ${message}`);
}

// 1 × 1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const signIn = (await client.action(api.auth.signIn as never, {
  provider: "anonymous",
  params: {},
} as never)) as {
  tokens?: { token?: string } | null;
};

if (!signIn?.tokens?.token) {
  console.error("Anonymous sign-in did not return a token:", signIn);
  process.exit(1);
}
client.setAuth(signIn.tokens.token);
console.log("✓ disposable anonymous session established");

const unauthenticated = new ConvexHttpClient(url);
let geoRejected = false;
try {
  await unauthenticated.action(api.geocoding.resolveLocation, {
    query: "51.95, 4.14",
  });
} catch {
  geoRejected = true;
}
ok(geoRejected, "unauthenticated geocoding is rejected");
const unauthProjects = await unauthenticated.query(api.projects.list, {
  limit: 5,
});
ok(unauthProjects.length === 0, "unauthenticated project list is empty");

const settings = await client.query(api.settings.get, {});
ok(typeof settings.aiEnabled === "boolean", "settings query returns a real AI preference");

const geo = await client.action(api.geocoding.resolveLocation, {
  query: "51.95, 4.14",
});
ok(geo.status === "ok", `coordinate location resolved (${geo.status})`);
if (geo.status !== "ok") process.exit(1);
const candidate = geo.candidates[0];
ok(candidate.bbox.length === 4, "resolved candidate carries a bounding box");

const search = await client.action(api.imagery.search, {
  bbox: candidate.bbox,
  date: "2024-06-28",
});
console.log(
  `  catalogue response: ${search.status}${
    "counts" in search ? ` · ${JSON.stringify(search.counts)}` : ""
  }`,
);
ok(
  search.status === "ok" || search.status === "empty" || search.status === "error",
  "catalogue action returns a classified status",
);
if (search.status === "error") {
  console.error("  catalogue failure:", search.kind, search.detail);
}

let projectId: string | null = null;

if (search.status === "ok" && search.scenes.length > 0) {
  const scene = search.scenes[0];
  const created = await client.mutation(api.projects.createFromScene, {
    location: candidate,
    requestedDate: search.requestedDate,
    dateMatch:
      scene.acquiredAt.slice(0, 10) === search.requestedDate ? "exact" : "window",
    scene,
  });
  projectId = created.id;
  ok(Boolean(created.id), "catalogue record stored");
  ok(created.dateMatch === "exact", "exact acquisition date preserved");

  const project = await client.query(api.projects.get, {
    id: created.id as never,
  });
  ok(project !== null, "stored record is readable by its owner");
  if (project) {
    ok(
      project.checks.some(
        (check) =>
          check.id === "internal-liquid-level" &&
          check.status === "NOT MEASURABLE",
      ),
      "liquid-level check is recorded as NOT MEASURABLE",
    );
    ok(
      project.checks.some(
        (check) => check.id === "tank-scale-measurement" && check.status === "NOT MEASURABLE",
      ),
      "image-derived tank measurement is refused",
    );
  }

  const saved = await client.mutation(api.calculations.save, {
    geometry: "vertical-cylinder",
    unit: "m",
    diameterValue: 4,
    secondValue: 5,
    projectId: created.id as never,
  });
  ok(saved.status === "ok", "calculation saved through the server engine");
  if (saved.status === "ok") {
    const volume = saved.calculation.volume.cubicMeters;
    ok(
      Math.abs(volume - 62.83185307179586) < 1e-12,
      `server-recomputed volume matches the reference (${volume})`,
    );
    const linked = await client.query(api.calculations.listForProject, {
      projectId: created.id as never,
    });
    ok(linked.length === 1, "calculation is linked to the record");
  }
} else {
  console.log("  no catalogue scenes returned; record creation skipped");
}

const ai = await client.action(api.ai.status, {});
console.log(
  `  AI adapter: configured=${ai.configured} model=${ai.model} adapter=${ai.adapter}`,
);
ok(typeof ai.configured === "boolean", "AI availability is reported from runtime configuration");

if (projectId) {
  const analysis = await client.action(api.ai.interpret, {
    projectId: projectId as never,
  });
  console.log(`  AI interpretation: ${analysis.status}`);
  if (analysis.status === "error" || analysis.status === "malformed" || analysis.status === "unavailable" || analysis.status === "blocked") {
    console.log(`  message: ${analysis.message}`);
  }
  ok(
    ["ok", "error", "malformed", "unavailable", "blocked", "invalid"].includes(
      analysis.status,
    ),
    "AI action reports an explicit outcome rather than failing silently",
  );
}

// Upload round-trip
const uploadUrl = await client.mutation(api.files.generateUploadUrl, {});
const png = Uint8Array.from(Buffer.from(PNG_BASE64, "base64"));
const uploadResponse = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: png,
});
ok(uploadResponse.ok, `storage accepted a signed upload (HTTP ${uploadResponse.status})`);
const uploaded = (await uploadResponse.json()) as { storageId?: string };
ok(Boolean(uploaded.storageId), "storage returned a file id");

if (uploaded.storageId) {
  const digest = createHash("sha256").update(png).digest("hex");
  const uploadProject = await client.mutation(api.projects.createFromUpload, {
    location: candidate,
    requestedDate: "2023-05-01",
    upload: {
      storageId: uploaded.storageId,
      filename: "integration-check.png",
      contentType: "image/png",
      sizeBytes: png.byteLength,
      width: 1,
      height: 1,
      sha256: digest,
      signatureOk: true,
      exifStatus: "absent",
      exifDateOriginal: null,
      exifHasGps: false,
      exifMake: null,
      exifModel: null,
      declaredCaptureDate: "2023-05-01",
      clientMetrics: null,
    },
  });
  ok(Boolean(uploadProject.id), "upload record stored");
  const uploadRecord = await client.query(api.projects.get, {
    id: uploadProject.id as never,
  });
  if (uploadRecord) {
    ok(uploadRecord.imageUrl !== null, "protected image URL is issued to the owner");
    ok(
      uploadRecord.checks.some(
        (check) =>
          check.id === "upload-provenance" && check.status === "NOT VERIFIED",
      ),
      "upload provenance is NOT VERIFIED",
    );
    ok(
      uploadRecord.checks.some(
        (check) => check.id === "upload-dimensions" && check.status === "WARN",
      ),
      "1 px image is flagged by the dimension rule",
    );
  }
}

const exported = await client.query(api.settings.exportData, {});
ok(exported !== null && exported.researchProjects.length >= 2, "export includes the created records");

const deletion = await client.mutation(api.settings.deleteAll, {});
console.log(`  cleanup: ${JSON.stringify(deletion)}`);
ok(deletion.projectsDeleted >= 2, "all test records deleted");
ok(deletion.imagesDeleted >= 1, "uploaded image deleted from storage");
ok(deletion.calculationsDeleted >= 1, "linked calculations deleted");

const after = await client.query(api.projects.list, { limit: 40 });
ok(after.length === 0, "record list is empty after deletion");

console.log(`\n${checks} live checks passed against ${url}`);
