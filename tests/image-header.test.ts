import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_PIXELS,
  parseImageHeader,
} from "../src/lib/image-header";

function png(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes.buffer;
}

function webpVp8x(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  view.setUint32(16, 10, true);
  bytes.set([0, 0, 0, 0], 20);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes.buffer;
}

function jpegSof(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x00, 0x00, 0x00,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height, false);
  view.setUint16(9, width, false);
  return bytes.buffer;
}

describe("server image header parsing", () => {
  it("reads PNG, WebP and JPEG dimensions", () => {
    expect(parseImageHeader(png(640, 480))).toEqual({
      type: "image/png",
      width: 640,
      height: 480,
    });
    expect(parseImageHeader(webpVp8x(320, 200))).toEqual({
      type: "image/webp",
      width: 320,
      height: 200,
    });
    expect(parseImageHeader(jpegSof(800, 600))).toEqual({
      type: "image/jpeg",
      width: 800,
      height: 600,
    });
  });

  it("enforces the 50 megapixel ceiling", () => {
    expect(parseImageHeader(png(10_000, 6_000))).toEqual({
      type: "image/png",
      width: 10_000,
      height: 6_000,
      error: "PIXEL_LIMIT",
    });
    expect(MAX_UPLOAD_PIXELS).toBe(50_000_000);
  });

  it("rejects malformed and unsupported headers", () => {
    expect(parseImageHeader(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });
});
