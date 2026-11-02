import { MAX_UPLOAD_PIXELS, parseImageHeader } from "./image-header";

/**
 * Client-side upload validation and heuristic image statistics.
 *
 * These checks run in the browser before upload. They are deterministic for a
 * given decoded image and browser, but they are heuristic: brightness and focus
 * proxies are not a radiometric or photogrammetric quality assessment.
 */

export type DetectedImageType = "image/jpeg" | "image/png" | "image/webp";

export type SignatureResult = {
  detected: DetectedImageType | null;
  matchesDeclared: boolean;
};

export function detectImageSignature(bytes: Uint8Array): DetectedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

export async function checkImageSignature(
  file: File,
  declaredType: string,
): Promise<SignatureResult> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageSignature(header);
  const normalizedDeclared = declaredType === "image/jpg" ? "image/jpeg" : declaredType;
  return {
    detected,
    matchesDeclared: detected !== null && detected === normalizedDeclared,
  };
}

export async function sha256Hex(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export type ImageQualityReport = {
  width: number;
  height: number;
  sampleWidth: number;
  sampleHeight: number;
  meanLuma: number;
  stdDevLuma: number;
  darkPixelFraction: number;
  brightPixelFraction: number;
  laplacianVariance: number;
};

export type ImageQualityOutcome =
  | { ok: true; report: ImageQualityReport }
  | { ok: false; message: string };

export type ImagePixelLimitResult =
  | { ok: true; width: number; height: number }
  | { ok: false; message: string };

const MAX_SAMPLE_EDGE = 512;

/** Reads only the file header, so an oversized image is never decoded. */
export async function checkImagePixelLimit(
  file: Blob,
): Promise<ImagePixelLimitResult> {
  const header = parseImageHeader(await file.arrayBuffer());
  if (!header) {
    return {
      ok: false,
      message:
        "The image size could not be read from the file header, so it was not opened. The file may be damaged.",
    };
  }
  if (
    header.error === "PIXEL_LIMIT" ||
    header.width * header.height > MAX_UPLOAD_PIXELS
  ) {
    return {
      ok: false,
      message: `This image is ${header.width} × ${header.height} pixels. The limit is ${MAX_UPLOAD_PIXELS / 1_000_000} megapixels, so it was not opened.`,
    };
  }
  return { ok: true, width: header.width, height: header.height };
}

export async function analyzeImageQuality(
  file: File,
): Promise<ImageQualityOutcome> {
  const pixelLimit = await checkImagePixelLimit(file);
  if (!pixelLimit.ok) return pixelLimit;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const sampleWidth = Math.max(1, Math.round(bitmap.width * scale));
    const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return { ok: false, message: "The browser did not provide a 2D canvas context." };
    }
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);

    const pixelCount = sampleWidth * sampleHeight;
    const luma = new Float32Array(pixelCount);
    let sum = 0;
    let dark = 0;
    let bright = 0;

    for (let index = 0; index < pixelCount; index += 1) {
      const base = index * 4;
      const value =
        0.2126 * data[base] + 0.7152 * data[base + 1] + 0.0722 * data[base + 2];
      luma[index] = value;
      sum += value;
      if (value < 16) dark += 1;
      if (value > 240) bright += 1;
    }

    const mean = sum / pixelCount;
    let varianceSum = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      const delta = luma[index] - mean;
      varianceSum += delta * delta;
    }
    const stdDev = Math.sqrt(varianceSum / pixelCount);

    let laplacianSum = 0;
    let laplacianSquares = 0;
    let laplacianCount = 0;
    for (let y = 1; y < sampleHeight - 1; y += 1) {
      for (let x = 1; x < sampleWidth - 1; x += 1) {
        const center = y * sampleWidth + x;
        const laplacian =
          4 * luma[center] -
          luma[center - 1] -
          luma[center + 1] -
          luma[center - sampleWidth] -
          luma[center + sampleWidth];
        laplacianSum += laplacian;
        laplacianSquares += laplacian * laplacian;
        laplacianCount += 1;
      }
    }
    const laplacianMean = laplacianCount ? laplacianSum / laplacianCount : 0;
    const laplacianVariance = laplacianCount
      ? laplacianSquares / laplacianCount - laplacianMean * laplacianMean
      : 0;

    return {
      ok: true,
      report: {
        width: bitmap.width,
        height: bitmap.height,
        sampleWidth,
        sampleHeight,
        meanLuma: mean,
        stdDevLuma: stdDev,
        darkPixelFraction: dark / pixelCount,
        brightPixelFraction: bright / pixelCount,
        laplacianVariance: Math.max(0, laplacianVariance),
      },
    };
  } catch {
    return {
      ok: false,
      message:
        "The image could not be decoded. It may be corrupt, truncated or not a supported image format.",
    };
  } finally {
    bitmap?.close();
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
