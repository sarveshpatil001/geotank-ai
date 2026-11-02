import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");

function testBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof testBackend>;

async function seedUser(t: Backend, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email });
  });
}

function identity(userId: string) {
  return {
    subject: `${userId}|test-session`,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${userId}|test-session`,
  };
}

function png(width = 64, height = 48): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

async function storeBlob(t: Backend, bytes: Uint8Array, type: string) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([bytes], { type }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-owned scene creation", () => {
  it("fetches the STAC item itself and ignores unknown scene fields", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "scene@test.dev");
    const item = {
      type: "Feature",
      id: "S2A_SERVER_FETCHED_ITEM",
      bbox: [4, 51.8, 4.5, 52],
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4, 51.8],
            [4.5, 51.8],
            [4.5, 52],
            [4, 51.8],
          ],
        ],
      },
      properties: {
        datetime: "2024-06-28T10:50:31Z",
        platform: "sentinel-2a",
        gsd: 10,
        "eo:cloud_cover": 12,
      },
      links: [
        {
          rel: "self",
          href: "https://stac.dataspace.copernicus.eu/items/1",
        },
      ],
      assets: {
        thumbnail: {
          href: "https://catalogue.dataspace.copernicus.eu/quicklook.jpg",
          roles: ["thumbnail"],
        },
      },
    };
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(item), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await t
      .withIdentity(identity(userId))
      .action(api.projects.createFromScene, {
        itemId: item.id,
        collectionId: "sentinel-2-l2a",
        location: {
          label: "Rotterdam, Netherlands",
          lat: 51.95,
          lon: 4.14,
          bbox: [4.0, 51.8, 4.5, 52.0],
          source: "OpenStreetMap Nominatim",
          attribution: "OSM",
          clamped: false,
        },
        requestedDate: "2024-06-28",
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const project = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(project?.scene?.itemId).toBe(item.id);
    expect(project?.dateMatch).toBe("exact");
    expect(project?.scene?.geometry?.type).toBe("Polygon");
  });
});

describe("pending uploads", () => {
  it("finalises only after server-side signature, dimensions and checksum checks", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "upload@test.dev");
    const storageId = await storeBlob(t, png(120, 80), "image/png");
    const asUser = t.withIdentity(identity(userId));

    const pending = await asUser.mutation(api.files.registerUpload, {
      storageId,
      filename: "../private/photo.png",
      contentType: "image/png",
    });
    const created = await asUser.action(api.upload.finalizeUpload, {
      uploadId: pending.uploadId,
      location: null,
      requestedDate: "2024-06-28",
    });

    const project = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(project?.upload?.width).toBe(120);
    expect(project?.upload?.height).toBe(80);
    expect(project?.upload?.filename).toBe("photo.png");
    expect(project?.upload?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(project?.upload?.signatureOk).toBe(true);
    const stillPending = await t.run(async (ctx) =>
      ctx.db.query("pendingUploads").collect(),
    );
    expect(stillPending).toHaveLength(0);
  });

  it("rejects a wrong magic-byte file, deletes the blob and the pending row", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "bad-upload@test.dev");
    const storageId = await storeBlob(
      t,
      new Uint8Array([1, 2, 3, 4, 5]),
      "image/png",
    );
    const asUser = t.withIdentity(identity(userId));
    const pending = await asUser.mutation(api.files.registerUpload, {
      storageId,
      filename: "not-an-image.png",
      contentType: "image/png",
    });

    await expect(
      asUser.action(api.upload.finalizeUpload, {
        uploadId: pending.uploadId,
        location: null,
        requestedDate: "2024-06-28",
      }),
    ).rejects.toThrow(/magic|JPEG|PNG|WebP/i);

    const state = await t.run(async (ctx) => {
      const metadata = await ctx.db.system.get(storageId as never);
      const pendingRows = await ctx.db.query("pendingUploads").collect();
      return { metadata, pendingRows };
    });
    expect(state.metadata).toBeNull();
    expect(state.pendingRows).toHaveLength(0);
  });

  it("keeps guest and signed-in global upload caps separate", async () => {
    vi.stubEnv("UPLOAD_GUEST_GLOBAL_DAILY_CAP", "1");
    vi.stubEnv("UPLOAD_GLOBAL_DAILY_CAP", "2");
    const t = testBackend();
    const guestId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "guest@test.dev", isAnonymous: true }),
    );
    const signedInId = await seedUser(t, "signed-in@test.dev");
    const guest = t.withIdentity(identity(guestId));
    const signedIn = t.withIdentity(identity(signedInId));

    const firstGuestBlob = await storeBlob(t, png(10, 10), "image/png");
    await expect(
      guest.mutation(api.files.registerUpload, {
        storageId: firstGuestBlob,
        filename: "guest-one.png",
        contentType: "image/png",
      }),
    ).resolves.toBeTruthy();

    const secondGuestBlob = await storeBlob(t, png(11, 11), "image/png");
    await expect(
      guest.mutation(api.files.registerUpload, {
        storageId: secondGuestBlob,
        filename: "guest-two.png",
        contentType: "image/png",
      }),
    ).rejects.toThrow(/rate limit/i);

    const signedInBlob = await storeBlob(t, png(12, 12), "image/png");
    await expect(
      signedIn.mutation(api.files.registerUpload, {
        storageId: signedInBlob,
        filename: "signed-in.png",
        contentType: "image/png",
      }),
    ).resolves.toBeTruthy();
  });

  it("prevents another user from finalising the upload", async () => {
    const t = testBackend();
    const userA = await seedUser(t, "owner@test.dev");
    const userB = await seedUser(t, "attacker@test.dev");
    const storageId = await storeBlob(t, png(10, 10), "image/png");
    const asA = t.withIdentity(identity(userA));
    const asB = t.withIdentity(identity(userB));
    const pending = await asA.mutation(api.files.registerUpload, {
      storageId,
      filename: "owner.png",
      contentType: "image/png",
    });

    await expect(
      asB.action(api.upload.finalizeUpload, {
        uploadId: pending.uploadId,
        location: null,
        requestedDate: "2024-06-28",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("purges unfinalised blobs after the hourly TTL", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "ttl@test.dev");
    const storageId = await storeBlob(t, png(10, 10), "image/png");
    const asUser = t.withIdentity(identity(userId));
    await asUser.mutation(api.files.registerUpload, {
      storageId,
      filename: "stale.png",
      contentType: "image/png",
    });

    const result = await t.mutation(internal.files.purgeUnfinalisedUploads, {
      now: Date.now() + 2 * 60 * 60 * 1000,
    });
    expect(result.deleted).toBe(1);
    expect(result.blobsDeleted).toBe(1);
    const metadata = await t.run(async (ctx) =>
      ctx.db.system.get(storageId as never),
    );
    expect(metadata).toBeNull();
  });
});
