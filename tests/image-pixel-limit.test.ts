import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeImageQuality,
  checkImagePixelLimit,
} from "../src/lib/image-quality";

function pngFile(width: number, height: number): File {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return new File([bytes], "image.png", { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser image pixel ceiling", () => {
  it("reads a tiny PNG header and refuses over 50 megapixels", async () => {
    const result = await checkImagePixelLimit(pngFile(10_000, 6_000));

    expect(result).toEqual({
      ok: false,
      message:
        "This image is 10000 × 6000 pixels. The limit is 50 megapixels, so it was not opened.",
    });
  });

  it("accepts an image at the limit and rejects an unreadable header", async () => {
    expect(await checkImagePixelLimit(pngFile(10_000, 5_000))).toEqual({
      ok: true,
      width: 10_000,
      height: 5_000,
    });
    expect(
      await checkImagePixelLimit(
        new File([new Uint8Array([1, 2, 3, 4])], "bad.png", {
          type: "image/png",
        }),
      ),
    ).toEqual({
      ok: false,
      message:
        "The image size could not be read from the file header, so it was not opened. The file may be damaged.",
    });
  });

  it("does not call createImageBitmap for an oversized image", async () => {
    const decode = vi.fn(() => {
      throw new Error("decode should not run");
    });
    vi.stubGlobal("createImageBitmap", decode);

    const result = await analyzeImageQuality(pngFile(10_000, 6_000));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("The limit is 50 megapixels");
    }
    expect(decode).not.toHaveBeenCalled();
  });
});
