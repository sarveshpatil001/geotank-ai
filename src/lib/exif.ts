/**
 * Minimal, defensive EXIF reader for JPEG uploads.
 *
 * Scope is deliberately small: file signature, dimensions are handled in
 * `image-quality.ts`; this module reads DateTimeOriginal, Make, Model,
 * Orientation and GPS latitude/longitude from the APP1/TIFF block.
 *
 * EXIF is editable metadata. The UI labels it as corroboration, never proof.
 */

export type ExifGps = { lat: number; lon: number };

export type ExifExtraction = {
  status: "present" | "absent" | "unreadable";
  dateTimeOriginal: string | null;
  gps: ExifGps | null;
  make: string | null;
  model: string | null;
  orientation: number | null;
  note: string;
};

export const EMPTY_EXIF: ExifExtraction = {
  status: "absent",
  dateTimeOriginal: null,
  gps: null,
  make: null,
  model: null,
  orientation: null,
  note: "No EXIF metadata block was found in the first 256 KiB of the file.",
};

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

type TiffContext = {
  view: DataView;
  tiffStart: number;
  littleEndian: boolean;
  byteLength: number;
};

type IfdEntry = {
  tag: number;
  type: number;
  count: number;
  valueFieldOffset: number;
};

function readAscii(view: DataView, start: number, count: number): string | null {
  if (start < 0 || start + count > view.byteLength || count <= 0) return null;
  let result = "";
  for (let index = 0; index < count; index += 1) {
    const code = view.getUint8(start + index);
    if (code === 0) break;
    result += String.fromCharCode(code);
  }
  return result.trim() || null;
}

function readUnsigned(
  view: DataView,
  offset: number,
  bytes: 1 | 2 | 4,
  littleEndian: boolean,
): number | null {
  if (offset < 0 || offset + bytes > view.byteLength) return null;
  if (bytes === 1) return view.getUint8(offset);
  if (bytes === 2) return view.getUint16(offset, littleEndian);
  return view.getUint32(offset, littleEndian);
}

function readIfdEntry(
  context: TiffContext,
  entryOffset: number,
): IfdEntry | null {
  const { view, littleEndian } = context;
  const tag = readUnsigned(view, entryOffset, 2, littleEndian);
  const type = readUnsigned(view, entryOffset + 2, 2, littleEndian);
  const count = readUnsigned(view, entryOffset + 4, 4, littleEndian);
  if (tag === null || type === null || count === null) return null;
  if (count > 1024) return null;
  return { tag, type, count, valueFieldOffset: entryOffset + 8 };
}

function entryDataOffset(context: TiffContext, entry: IfdEntry): number | null {
  const sizes: Record<number, number> = {
    1: 1, // BYTE
    2: 1, // ASCII
    3: 2, // SHORT
    4: 4, // LONG
    5: 8, // RATIONAL
    7: 1, // UNDEFINED
    9: 4, // SLONG
    10: 8, // SRATIONAL
  };
  const unitSize = sizes[entry.type];
  if (!unitSize) return null;
  const total = unitSize * entry.count;
  if (total <= 4) return entry.valueFieldOffset;
  const relative = readUnsigned(
    context.view,
    entry.valueFieldOffset,
    4,
    context.littleEndian,
  );
  if (relative === null) return null;
  return context.tiffStart + relative;
}

function readIfd(context: TiffContext, relativeOffset: number): IfdEntry[] | null {
  const { view, littleEndian } = context;
  const offset = context.tiffStart + relativeOffset;
  const count = readUnsigned(view, offset, 2, littleEndian);
  if (count === null || count > 256) return null;
  const entries: IfdEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    const entry = readIfdEntry(context, entryOffset);
    if (!entry) return null;
    entries.push(entry);
  }
  return entries;
}

function findEntry(entries: IfdEntry[], tag: number): IfdEntry | null {
  return entries.find((entry) => entry.tag === tag) ?? null;
}

function readAsciiEntry(context: TiffContext, entry: IfdEntry): string | null {
  if (entry.type !== 2) return null;
  const offset = entryDataOffset(context, entry);
  if (offset === null) return null;
  return readAscii(context.view, offset, entry.count);
}

function readRationals(
  context: TiffContext,
  entry: IfdEntry,
): { numerator: number; denominator: number }[] | null {
  if (entry.type !== 5) return null;
  const offset = entryDataOffset(context, entry);
  if (offset === null) return null;
  const values: { numerator: number; denominator: number }[] = [];
  for (let index = 0; index < entry.count; index += 1) {
    const numerator = readUnsigned(
      context.view,
      offset + index * 8,
      4,
      context.littleEndian,
    );
    const denominator = readUnsigned(
      context.view,
      offset + index * 8 + 4,
      4,
      context.littleEndian,
    );
    if (numerator === null || denominator === null || denominator === 0) {
      return null;
    }
    values.push({ numerator, denominator });
  }
  return values;
}

function readShortEntry(context: TiffContext, entry: IfdEntry): number | null {
  if (entry.type !== 3) return null;
  const offset = entryDataOffset(context, entry);
  if (offset === null) return null;
  return readUnsigned(context.view, offset, 2, context.littleEndian);
}

function normalizeExifDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

function dmsToDecimal(
  ref: string | null,
  values: { numerator: number; denominator: number }[] | null,
): number | null {
  if (!values || values.length < 3) return null;
  const degrees = values[0].numerator / values[0].denominator;
  const minutes = values[1].numerator / values[1].denominator;
  const seconds = values[2].numerator / values[2].denominator;
  const decimal = degrees + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(decimal)) return null;
  if (ref && /^[SW]$/i.test(ref.trim())) return -decimal;
  return decimal;
}

export type ParsedExif = {
  status: "present" | "absent" | "unreadable";
  dateTimeOriginal: string | null;
  gps: ExifGps | null;
  make: string | null;
  model: string | null;
  orientation: number | null;
  note: string;
};

/** Parse an in-buffer JPEG for its EXIF block. Exported for testing. */
export function parseJpegExif(buffer: ArrayBuffer): ParsedExif {
  const empty: ParsedExif = {
    status: "unreadable",
    dateTimeOriginal: null,
    gps: null,
    make: null,
    model: null,
    orientation: null,
    note: "EXIF parsing did not complete.",
  };
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return empty;
    if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) {
      return { ...empty, note: "Not a JPEG file signature." };
    }

    let offset = 2;
    let tiffStart: number | null = null;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2) break;
      const dataStart = offset + 4;
      if (dataStart + segmentLength > view.byteLength) {
        return {
          ...empty,
          note:
            marker === 0xe1
              ? "The APP1 EXIF segment is truncated."
              : "A JPEG segment claims more bytes than the file contains.",
        };
      }
      if (marker === 0xe1) {
        const hasExifHeader =
          dataStart + 6 <= view.byteLength &&
          view.getUint8(dataStart) === 0x45 && // E
          view.getUint8(dataStart + 1) === 0x78 && // x
          view.getUint8(dataStart + 2) === 0x69 && // i
          view.getUint8(dataStart + 3) === 0x66 && // f
          view.getUint8(dataStart + 4) === 0x00 &&
          view.getUint8(dataStart + 5) === 0x00;
        if (hasExifHeader) {
          tiffStart = dataStart + 6;
          break;
        }
      }
      offset += 2 + segmentLength;
    }

    if (tiffStart === null) {
      // A JPEG can end before a declared segment even starts (for example a
      // five-byte SOI + APP1 prefix). That is malformed, not "no EXIF".
      if (
        view.byteLength >= 4 &&
        view.getUint8(2) === 0xff &&
        view.getUint8(3) === 0xe1 &&
        view.byteLength < 8
      ) {
        return { ...empty, note: "The APP1 EXIF segment is truncated." };
      }
      return {
        ...empty,
        status: "absent",
        note: "No APP1 EXIF segment was found in this JPEG.",
      };
    }

    const byteOrder =
      view.getUint16(tiffStart, false) === 0x4949 ? "II" : "MM";
    const littleEndian = byteOrder === "II";
    const context: TiffContext = {
      view,
      tiffStart,
      littleEndian,
      byteLength: view.byteLength,
    };
    const magic = readUnsigned(view, tiffStart + 2, 2, littleEndian);
    if (magic !== 42) {
      return { ...empty, note: "TIFF header magic number is invalid." };
    }
    const ifd0Relative = readUnsigned(view, tiffStart + 4, 4, littleEndian);
    if (ifd0Relative === null) return empty;
    const ifd0 = readIfd(context, ifd0Relative);
    if (!ifd0) return { ...empty, note: "IFD0 could not be read." };

    const make = (() => {
      const entry = findEntry(ifd0, TAG_MAKE);
      return entry ? readAsciiEntry(context, entry) : null;
    })();
    const model = (() => {
      const entry = findEntry(ifd0, TAG_MODEL);
      return entry ? readAsciiEntry(context, entry) : null;
    })();
    const orientationEntry = findEntry(ifd0, TAG_ORIENTATION);
    const orientation = orientationEntry
      ? readShortEntry(context, orientationEntry)
      : null;

    let dateTimeOriginal: string | null = null;
    const exifPointer = findEntry(ifd0, TAG_EXIF_IFD);
    if (exifPointer && exifPointer.type === 4) {
      const relative = readUnsigned(
        view,
        exifPointer.valueFieldOffset,
        4,
        littleEndian,
      );
      if (relative !== null) {
        const exifIfd = readIfd(context, relative);
        if (exifIfd) {
          const dateEntry = findEntry(exifIfd, TAG_DATETIME_ORIGINAL);
          if (dateEntry) {
            dateTimeOriginal = normalizeExifDate(
              readAsciiEntry(context, dateEntry),
            );
          }
        }
      }
    }

    let gps: ExifGps | null = null;
    const gpsPointer = findEntry(ifd0, TAG_GPS_IFD);
    if (gpsPointer && gpsPointer.type === 4) {
      const relative = readUnsigned(
        view,
        gpsPointer.valueFieldOffset,
        4,
        littleEndian,
      );
      if (relative !== null) {
        const gpsIfd = readIfd(context, relative);
        if (gpsIfd) {
          const latRefEntry = findEntry(gpsIfd, TAG_GPS_LAT_REF);
          const lonRefEntry = findEntry(gpsIfd, TAG_GPS_LON_REF);
          const latEntry = findEntry(gpsIfd, TAG_GPS_LAT);
          const lonEntry = findEntry(gpsIfd, TAG_GPS_LON);
          const latRef = latRefEntry
            ? readAsciiEntry(context, latRefEntry)
            : null;
          const lonRef = lonRefEntry
            ? readAsciiEntry(context, lonRefEntry)
            : null;
          const lat = latEntry ? dmsToDecimal(latRef, readRationals(context, latEntry)) : null;
          const lon = lonEntry ? dmsToDecimal(lonRef, readRationals(context, lonEntry)) : null;
          if (
            lat !== null &&
            lon !== null &&
            Math.abs(lat) <= 90 &&
            Math.abs(lon) <= 180
          ) {
            gps = { lat, lon };
          }
        }
      }
    }

    return {
      status: "present",
      dateTimeOriginal,
      gps,
      make,
      model,
      orientation,
      note: gps
        ? "EXIF present. DateTimeOriginal and GPS are editable metadata, not proof of capture time or provenance."
        : "EXIF present. DateTimeOriginal is editable metadata, not proof of capture time or provenance.",
    };
  } catch {
    return empty;
  }
}

export async function extractExif(file: Blob): Promise<ExifExtraction> {
  if (file.type !== "image/jpeg" && file.type !== "image/jpg") {
    return {
      ...EMPTY_EXIF,
      note: "EXIF extraction in v1 is limited to JPEG uploads; this file type carries no parsed EXIF.",
    };
  }
  try {
    const header = await file.slice(0, 256 * 1024).arrayBuffer();
    const parsed = parseJpegExif(header);
    return {
      status: parsed.status,
      dateTimeOriginal: parsed.dateTimeOriginal,
      gps: parsed.gps,
      make: parsed.make,
      model: parsed.model,
      orientation: parsed.orientation,
      note: parsed.note,
    };
  } catch {
    return {
      ...EMPTY_EXIF,
      status: "unreadable",
      note: "The file header could not be read for EXIF metadata.",
    };
  }
}
