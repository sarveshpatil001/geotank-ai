/**
 * Deterministic tank geometry engine.
 *
 * This module is the only authoritative source of numerical results in the
 * application. It is pure, synchronous and free of AI or network calls. The
 * Convex backend re-runs these functions on save so a client cannot submit an
 * invented volume.
 *
 * Numerical representation: IEEE-754 double precision (JavaScript `number`).
 * Inputs are validated as finite, positive and within documented engineering
 * bounds. Intermediate results are never rounded; rounding happens only in the
 * presentation helpers at the bottom of this file.
 */

export const ENGINE_VERSION = "tank-math/1.0.0" as const;

export const LENGTH_UNITS = {
  m: { label: "metres", symbol: "m", metersPerUnit: 1 },
  cm: { label: "centimetres", symbol: "cm", metersPerUnit: 0.01 },
  mm: { label: "millimetres", symbol: "mm", metersPerUnit: 0.001 },
  ft: { label: "feet", symbol: "ft", metersPerUnit: 0.3048 },
  in: { label: "inches", symbol: "in", metersPerUnit: 0.0254 },
} as const;

export type LengthUnit = keyof typeof LENGTH_UNITS;

/** Documented engineering bounds. A single tank dimension outside 1 cm – 200 m
 *  is almost certainly a unit or data-entry error. */
export const DIMENSION_LIMITS = {
  minMeters: 0.01,
  maxMeters: 200,
} as const;

export const VOLUME_CONSTANTS = {
  litersPerCubicMeter: 1000,
  /** US liquid gallon = 231 in³ = 3.785411784 L (exact by definition). */
  litersPerUsGallon: 3.785411784,
  /** Oil barrel = 42 US gallons. */
  usGallonsPerOilBarrel: 42,
} as const;

export type TankGeometry = "vertical-cylinder" | "horizontal-cylinder";

export const TANK_GEOMETRIES = {
  "vertical-cylinder": {
    id: "vertical-cylinder",
    label: "Vertical cylinder",
    description:
      "Upright circular cylinder. Uses the internal radius and the internal cylindrical height.",
    formula: "V = π × r² × H",
    secondField: "height" as const,
  },
  "horizontal-cylinder": {
    id: "horizontal-cylinder",
    label: "Horizontal cylinder",
    description:
      "Cylinder lying on its side. Full-capacity only, using the internal radius and internal cylindrical length.",
    formula: "V = π × r² × L",
    secondField: "length" as const,
  },
} as const;

export type DimensionField =
  | "diameter"
  | "radius"
  | "height"
  | "length"
  | "density";

export type DimensionProblemCode =
  | "REQUIRED"
  | "NOT_A_NUMBER"
  | "NOT_FINITE"
  | "NON_POSITIVE"
  | "OUT_OF_RANGE";

export type DimensionProblem = {
  field: DimensionField;
  code: DimensionProblemCode;
  message: string;
};

export type LengthResult =
  | { ok: true; meters: number; unit: LengthUnit; input: number }
  | { ok: false; problem: DimensionProblem };

const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const FIELD_NAMES: Record<DimensionField, string> = {
  diameter: "internal diameter",
  radius: "internal radius",
  height: "internal cylindrical height",
  length: "internal cylindrical length",
  density: "liquid density",
};

/**
 * Parse and validate a length in the given unit, returning metres.
 * Rejects empty strings, hex/Infinity strings, NaN, ±Infinity, zero,
 * negative values and values outside the documented bounds.
 */
export function parseLength(
  input: string | number,
  unit: LengthUnit,
  field: DimensionField = "diameter",
): LengthResult {
  const fieldName = FIELD_NAMES[field];
  const unitInfo = LENGTH_UNITS[unit];
  if (!unitInfo) {
    return {
      ok: false,
      problem: {
        field,
        code: "NOT_A_NUMBER",
        message: `Unsupported unit for ${fieldName}.`,
      },
    };
  }

  let numeric: number;
  if (typeof input === "number") {
    numeric = input;
  } else {
    const trimmed = String(input ?? "").trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        problem: {
          field,
          code: "REQUIRED",
          message: `Enter the ${fieldName}.`,
        },
      };
    }
    if (!DECIMAL_PATTERN.test(trimmed)) {
      return {
        ok: false,
        problem: {
          field,
          code: "NOT_A_NUMBER",
          message: `The ${fieldName} must be a decimal number.`,
        },
      };
    }
    numeric = Number(trimmed);
  }

  if (Number.isNaN(numeric)) {
    return {
      ok: false,
      problem: {
        field,
        code: "NOT_A_NUMBER",
        message: `The ${fieldName} must be a decimal number.`,
      },
    };
  }
  if (!Number.isFinite(numeric)) {
    return {
      ok: false,
      problem: {
        field,
        code: "NOT_FINITE",
        message: `The ${fieldName} must be a finite number.`,
      },
    };
  }
  if (numeric <= 0) {
    return {
      ok: false,
      problem: {
        field,
        code: "NON_POSITIVE",
        message: `The ${fieldName} must be greater than zero.`,
      },
    };
  }

  const meters = numeric * unitInfo.metersPerUnit;
  if (!Number.isFinite(meters)) {
    return {
      ok: false,
      problem: {
        field,
        code: "NOT_FINITE",
        message: `The ${fieldName} overflows the supported numeric range.`,
      },
    };
  }
  if (
    meters < DIMENSION_LIMITS.minMeters ||
    meters > DIMENSION_LIMITS.maxMeters
  ) {
    return {
      ok: false,
      problem: {
        field,
        code: "OUT_OF_RANGE",
        message: `The ${fieldName} must be between ${DIMENSION_LIMITS.minMeters} m and ${DIMENSION_LIMITS.maxMeters} m (received ${formatDecimal(meters, 4)} m).`,
      },
    };
  }

  return { ok: true, meters, unit, input: numeric };
}

/** Ideal vertical cylinder volume in cubic metres: V = π r² H. */
export function verticalCylinderVolumeM3(
  radiusM: number,
  heightM: number,
): number {
  return Math.PI * radiusM * radiusM * heightM;
}

/** Ideal horizontal cylinder full-capacity volume: V = π r² L. */
export function horizontalCylinderVolumeM3(
  radiusM: number,
  lengthM: number,
): number {
  return Math.PI * radiusM * radiusM * lengthM;
}

export type VolumeSet = {
  cubicMeters: number;
  liters: number;
  usGallons: number;
  oilBarrels: number;
};

/** Convert a cubic-metre volume into the reported units without rounding the
 *  intermediate values. */
export function convertVolume(cubicMeters: number): VolumeSet {
  const liters = cubicMeters * VOLUME_CONSTANTS.litersPerCubicMeter;
  const usGallons = liters / VOLUME_CONSTANTS.litersPerUsGallon;
  return {
    cubicMeters,
    liters,
    usGallons,
    oilBarrels: usGallons / VOLUME_CONSTANTS.usGallonsPerOilBarrel,
  };
}

export type CapacityInput = {
  geometry: TankGeometry;
  unit: LengthUnit;
  diameter: string | number;
  height?: string | number;
  length?: string | number;
};

export type CapacityCalculation = {
  engineVersion: typeof ENGINE_VERSION;
  geometry: TankGeometry;
  geometryLabel: string;
  formula: string;
  unit: LengthUnit;
  diameterInput: number;
  secondInput: number;
  diameterM: number;
  radiusM: number;
  heightM?: number;
  lengthM?: number;
  volume: VolumeSet;
};

export type CapacityOutcome =
  | { ok: true; calculation: CapacityCalculation }
  | { ok: false; problems: DimensionProblem[] };

/**
 * Compute the theoretical geometric capacity of an ideal cylinder.
 * All invalid inputs produce explicit problems; nothing throws.
 */
export function computeCapacity(input: CapacityInput): CapacityOutcome {
  const geometry = TANK_GEOMETRIES[input.geometry];
  if (!geometry) {
    return {
      ok: false,
      problems: [
        {
          field: "diameter",
          code: "NOT_A_NUMBER",
          message: "Unsupported tank geometry.",
        },
      ],
    };
  }

  const problems: DimensionProblem[] = [];

  const diameter = parseLength(input.diameter, input.unit, "diameter");
  if (!diameter.ok) problems.push(diameter.problem);

  const secondField = geometry.secondField;
  const secondRaw =
    secondField === "height" ? input.height : input.length;
  const second = parseLength(secondRaw ?? "", input.unit, secondField);
  if (!second.ok) problems.push(second.problem);

  if (!diameter.ok || !second.ok) {
    return { ok: false, problems };
  }

  const radiusM = diameter.meters / 2;
  const volumeM3 =
    secondField === "height"
      ? verticalCylinderVolumeM3(radiusM, second.meters)
      : horizontalCylinderVolumeM3(radiusM, second.meters);

  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) {
    return {
      ok: false,
      problems: [
        {
          field: "diameter",
          code: "NOT_FINITE",
          message:
            "The calculation did not produce a finite positive volume. Check the dimensions.",
        },
      ],
    };
  }

  return {
    ok: true,
    calculation: {
      engineVersion: ENGINE_VERSION,
      geometry: input.geometry,
      geometryLabel: geometry.label,
      formula: geometry.formula,
      unit: input.unit,
      diameterInput: diameter.input,
      secondInput: second.input,
      diameterM: diameter.meters,
      radiusM,
      heightM: secondField === "height" ? second.meters : undefined,
      lengthM: secondField === "length" ? second.meters : undefined,
      volume: convertVolume(volumeM3),
    },
  };
}

export const DENSITY_LIMITS = {
  minKgPerCubicMeter: 1,
  maxKgPerCubicMeter: 2000,
} as const;

export type MassOutcome =
  | { ok: true; kilograms: number; tonnes: number; densityKgPerCubicMeter: number }
  | { ok: false; problem: DimensionProblem };

/**
 * ESTIMATED mass from a stated density. This is explicitly not inventory:
 * it assumes the entire theoretical capacity is filled with a liquid of the
 * stated density. Temperature effects are not modelled.
 */
export function estimateMassFromDensity(
  volumeM3: number,
  densityInput: string | number,
): MassOutcome {
  const density =
    typeof densityInput === "number"
      ? densityInput
      : Number(String(densityInput ?? "").trim());
  if (!Number.isFinite(density)) {
    return {
      ok: false,
      problem: {
        field: "density",
        code: "NOT_FINITE",
        message: "The liquid density must be a finite number.",
      },
    };
  }
  if (density <= 0) {
    return {
      ok: false,
      problem: {
        field: "density",
        code: "NON_POSITIVE",
        message: "The liquid density must be greater than zero.",
      },
    };
  }
  if (
    density < DENSITY_LIMITS.minKgPerCubicMeter ||
    density > DENSITY_LIMITS.maxKgPerCubicMeter
  ) {
    return {
      ok: false,
      problem: {
        field: "density",
        code: "OUT_OF_RANGE",
        message: `The liquid density must be between ${DENSITY_LIMITS.minKgPerCubicMeter} and ${DENSITY_LIMITS.maxKgPerCubicMeter} kg/m³.`,
      },
    };
  }
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) {
    return {
      ok: false,
      problem: {
        field: "density",
        code: "NOT_FINITE",
        message: "A finite positive volume is required before estimating mass.",
      },
    };
  }
  const kilograms = volumeM3 * density;
  return {
    ok: true,
    kilograms,
    tonnes: kilograms / 1000,
    densityKgPerCubicMeter: density,
  };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers — the only place values are rounded for display.       */
/* -------------------------------------------------------------------------- */

export function formatDecimal(
  value: number | null | undefined,
  maxFractionDigits = 3,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatVolume(
  value: number,
  maxFractionDigits = 3,
): string {
  return formatDecimal(value, maxFractionDigits);
}
