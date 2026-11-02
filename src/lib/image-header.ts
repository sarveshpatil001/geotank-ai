import type { DetectedImageType } from "./image-quality";

export const MAX_UPLOAD_PIXELS = 50_000_000;

export type ParsedImageHeader = {
  type: DetectedImageType;
  width: number;
  height: number;
  error?: "PIXEL_LIMIT";
};

function readU16(view: DataView, offset: number, little = false): number | null {
  if (offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, little);
}

function readU24(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 > bytes.byteLength) return null;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function withLimit(
  type: DetectedImageType,
  width: number,
  height: number,
): ParsedImageHeader | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  if (width * height > MAX_UPLOAD_PIXELS) {
    return { type, width, height, error: "PIXEL_LIMIT" };
  }
  return { type, width, height };
}

/**
 * Reads only the dimensions from a JPEG/PNG/WebP header. No decoder or client
 * claim is involved, which is what lets the server enforce the pixel ceiling.
 */
export function parseImageHeader(buffer: ArrayBuffer): ParsedImageHeader | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) break;
      const length = readU16(view, offset + 2);
      if (length === null || length < 2) break;
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame) {
        if (offset + 9 > bytes.length) return null;
        const height = view.getUint16(offset + 5, false);
        const width = view.getUint16(offset + 7, false);
        return withLimit("image/jpeg", width, height);
      }
      offset += 2 + length;
    }
    return null;
  }

  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return withLimit("image/png", width, height);
  }

  if (
    bytes.length >= 20 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = (readU24(bytes, 24) ?? 0) + 1;
      const height = (readU24(bytes, 27) ?? 0) + 1;
      return withLimit("image/webp", width, height);
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const width = 1 + (((bytes[21] & 0x3f) << 8) | bytes[22]);
      const height =
        1 +
        (((bytes[23] & 0x0f) << 10) | (bytes[24] << 2) | (bytes[25] >> 6));
      return withLimit("image/webp", width, height);
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        return null;
      }
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return withLimit("image/webp", width, height);
    }
    return null;
  }

  return null;
}
