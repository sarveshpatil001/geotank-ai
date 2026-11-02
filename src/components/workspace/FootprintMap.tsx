import { useMemo } from "react";

import { formatCoordinate } from "@/lib/catalogue";
import { cn } from "@/lib/utils";

type Ring = [number, number][];

function extractRings(geometry: unknown): Ring[] {
  if (!geometry || typeof geometry !== "object") return [];
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  const rings: Ring[] = [];

  const cleanRing = (value: unknown): Ring => {
    if (!Array.isArray(value)) return [];
    return value
      .map((point) =>
        Array.isArray(point) && point.length >= 2
          ? ([Number(point[0]), Number(point[1])] as [number, number])
          : null,
      )
      .filter(
        (point): point is [number, number] =>
          point !== null && Number.isFinite(point[0]) && Number.isFinite(point[1]),
      );
  };

  if (candidate.type === "Polygon" && Array.isArray(candidate.coordinates)) {
    const ring = cleanRing(candidate.coordinates[0]);
    if (ring.length >= 3) rings.push(ring);
  }
  if (candidate.type === "MultiPolygon" && Array.isArray(candidate.coordinates)) {
    for (const polygon of candidate.coordinates) {
      if (!Array.isArray(polygon)) continue;
      const ring = cleanRing(polygon[0]);
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
}

/**
 * Schematic footprint diagram built only from provider geometry/bbox.
 * This is a spatial diagram, not a basemap and not imagery.
 */
export function FootprintMap({
  bbox,
  geometry,
  label,
  center,
  className,
}: {
  bbox: number[] | null;
  geometry?: unknown;
  label: string;
  center?: { lat: number; lon: number } | null;
  className?: string;
}) {
  const rings = useMemo(() => extractRings(geometry), [geometry]);

  const bounds = useMemo(() => {
    const numericBbox =
      Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))
        ? [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])]
        : null;
    if (numericBbox && numericBbox[2] > numericBbox[0] && numericBbox[3] > numericBbox[1]) {
      return numericBbox;
    }
    const points = rings.flat();
    if (points.length > 0) {
      const lons = points.map(([lon]) => lon);
      const lats = points.map(([, lat]) => lat);
      return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
    if (center) {
      return [center.lon - 0.02, center.lat - 0.02, center.lon + 0.02, center.lat + 0.02];
    }
    return null;
  }, [bbox, center, rings]);

  if (!bounds) {
    return (
      <div
        className={cn(
          "flex aspect-square w-full items-center justify-center rounded-xl border border-edge/70 bg-abyss/60 p-6 text-center",
          className,
        )}
      >
        <p className="text-xs leading-5 text-mist">
          No footprint or bounding box was returned for this record, so no
          spatial diagram is drawn.
        </p>
      </div>
    );
  }

  const [west, south, east, north] = bounds;
  const lonSpan = Math.max(east - west, 1e-6);
  const latSpan = Math.max(north - south, 1e-6);
  const project = (lon: number, lat: number) => {
    const x = ((lon - west) / lonSpan) * 100;
    const y = ((north - lat) / latSpan) * 100;
    return [Math.max(-5, Math.min(105, x)), Math.max(-5, Math.min(105, y))];
  };

  const ringPaths = rings.map((ring) =>
    ring
      .map(([lon, lat], index) => {
        const [x, y] = project(lon, lat);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z",
  );

  const centerLat = south + latSpan / 2;
  const centerLon = west + lonSpan / 2;
  const [cx, cy] = project(center?.lon ?? centerLon, center?.lat ?? centerLat);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative overflow-hidden rounded-xl border border-edge/80 bg-[#081a20]">
        <svg
          viewBox="0 0 100 100"
          className="w-full"
          role="img"
          aria-label={`Spatial diagram for ${label}`}
        >
          <defs>
            <pattern id="footprint-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="#24443E"
                strokeWidth="0.35"
              />
            </pattern>
            <radialGradient id="footprint-glow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#43D9A0" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#43D9A0" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#footprint-grid)" opacity="0.7" />
          <circle cx={cx} cy={cy} r="42" fill="url(#footprint-glow)" />
          <circle cx={cx} cy={cy} r="28" fill="none" stroke="#43D9A0" strokeOpacity="0.2" strokeWidth="0.4" strokeDasharray="2 3" />
          <circle cx={cx} cy={cy} r="14" fill="none" stroke="#43D9A0" strokeOpacity="0.28" strokeWidth="0.4" />

          {ringPaths.length > 0 ? (
            ringPaths.map((path, index) => (
              <path
                key={index}
                d={path}
                fill="#43D9A0"
                fillOpacity="0.1"
                stroke="#43D9A0"
                strokeWidth="0.7"
              />
            ))
          ) : (
            <rect
              x="14"
              y="14"
              width="72"
              height="72"
              fill="#43D9A0"
              fillOpacity="0.06"
              stroke="#43D9A0"
              strokeWidth="0.6"
              strokeDasharray="3 2"
            />
          )}

          <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 4} stroke="#F0F7F4" strokeWidth="0.5" />
          <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} stroke="#F0F7F4" strokeWidth="0.5" />
          <circle cx={cx} cy={cy} r="1.6" fill="#43D9A0" />

          <text x="3" y="97" fill="#91AAA5" fontSize="2.6" fontFamily="monospace">
            W {west.toFixed(3)}
          </text>
          <text x="72" y="97" fill="#91AAA5" fontSize="2.6" fontFamily="monospace">
            E {east.toFixed(3)}
          </text>
          <text x="3" y="5" fill="#91AAA5" fontSize="2.6" fontFamily="monospace">
            N {north.toFixed(3)}
          </text>
          <text x="3" y="91" fill="#91AAA5" fontSize="2.6" fontFamily="monospace">
            S {south.toFixed(3)}
          </text>
        </svg>
        <div className="pointer-events-none absolute right-2 top-2 rounded border border-edge/80 bg-navy/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-mint backdrop-blur">
          footprint · not a basemap
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-mist">
        Provider-declared extent centred on{" "}
        <span className="font-mono text-mint">
          {formatCoordinate(center?.lat ?? centerLat, center?.lon ?? centerLon)}
        </span>
        . Diagram only: no ground control points are measured, so overlay
        alignment is not a measurement of accuracy.
      </p>
    </div>
  );
}
