import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Callout,
  Panel,
  SectionHeading,
  StatTile,
} from "@/components/workspace/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  computeCapacity,
  DENSITY_LIMITS,
  ENGINE_VERSION,
  estimateMassFromDensity,
  formatVolume,
  LENGTH_UNITS,
  TANK_GEOMETRIES,
  type LengthUnit,
  type TankGeometry,
} from "@/lib/tank-geometry";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  CheckCircle2,
  Cylinder,
  Loader2,
  Ruler,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

const GEOMETRY_ICONS: Record<TankGeometry, typeof Cylinder> = {
  "vertical-cylinder": Cylinder,
  "horizontal-cylinder": Ruler,
};

export default function CalculatorPage() {
  const [searchParams] = useSearchParams();
  const projectParam = searchParams.get("project");
  const projectId =
    projectParam && /^[a-zA-Z0-9]{16,64}$/.test(projectParam)
      ? (projectParam as Id<"researchProjects">)
      : undefined;
  const project = useQuery(
    api.projects.get,
    projectId ? { id: projectId } : "skip",
  );
  const saveCalculation = useMutation(api.calculations.save);

  const [geometry, setGeometry] = useState<TankGeometry>("vertical-cylinder");
  const [unit, setUnit] = useState<LengthUnit>("m");
  const [diameter, setDiameter] = useState("");
  const [second, setSecond] = useState("");
  const [density, setDensity] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const outcome = useMemo(
    () =>
      computeCapacity({
        geometry,
        unit,
        diameter,
        height: geometry === "vertical-cylinder" ? second : undefined,
        length: geometry === "horizontal-cylinder" ? second : undefined,
      }),
    [geometry, unit, diameter, second],
  );

  const mass = useMemo(() => {
    if (!outcome.ok || density.trim() === "") return null;
    return estimateMassFromDensity(outcome.calculation.volume.cubicMeters, density);
  }, [outcome, density]);

  const secondLabel = TANK_GEOMETRIES[geometry].secondField === "height"
    ? "Internal cylindrical height"
    : "Internal cylindrical length";

  const handleSave = async () => {
    if (!outcome.ok) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const result = await saveCalculation({
        geometry,
        unit,
        diameterValue: outcome.calculation.diameterInput,
        secondValue: outcome.calculation.secondInput,
        projectId: projectId ?? undefined,
      });
      if (result.status === "invalid") {
        setSaveError(result.message);
      } else {
        setSaveMessage(
          `Saved. The stored record was recomputed server-side: ${formatVolume(
            result.calculation.volume.cubicMeters,
            6,
          )} m³.`,
        );
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "The calculation could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Deterministic engine · {ENGINE_VERSION}</p>
          <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Tank calculator
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
            Ideal-cylinder geometry only, computed with IEEE-754 double precision
            and validated inputs. The arithmetic is exact for the geometry it
            models; the dimensions are yours, and physical verification is a
            separate exercise.
          </p>
        </div>
        <span className="rounded-full border border-edge bg-abyss/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
          no AI in the calculation path
        </span>
      </div>

      {projectId && (
        <Callout tone="info" title="Attached to a research record">
          {project
            ? `Saving here links the calculation to “${project.title}”.`
            : "Loading the linked research record…"}{" "}
          <Link
            to={`/workspace/project/${projectId}`}
            className="text-emerald underline decoration-emerald/30 underline-offset-4"
          >
            Open record
          </Link>
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Panel className="space-y-6">
          <div>
            <p className="eyebrow">Geometry</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(Object.keys(TANK_GEOMETRIES) as TankGeometry[]).map((key) => {
                const option = TANK_GEOMETRIES[key];
                const Icon = GEOMETRY_ICONS[key];
                const active = geometry === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGeometry(key)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      active
                        ? "border-emerald/50 bg-emerald/[0.07]"
                        : "border-edge/70 bg-abyss/50 hover:border-emerald/30",
                    )}
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className={cn(
                          "size-5",
                          active ? "text-emerald" : "text-mist",
                        )}
                      />
                      {active && <CheckCircle2 className="size-4 text-emerald" />}
                    </div>
                    <p className="mt-2.5 font-display text-sm font-medium text-ink">
                      {option.label}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-mint">{option.formula}</p>
                    <p className="mt-2 text-[11px] leading-4 text-mist">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 border-t border-edge/60 pt-5">
            <div>
              <Label htmlFor="unit" className="mb-2 text-xs text-mist">
                Unit for all entered dimensions
              </Label>
              <select
                id="unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as LengthUnit)}
                className="h-11 w-full rounded-lg border border-edge bg-abyss/70 px-3 text-sm text-ink outline-none focus-visible:border-emerald/60 focus-visible:ring-2 focus-visible:ring-emerald/20"
              >
                {(Object.keys(LENGTH_UNITS) as LengthUnit[]).map((key) => (
                  <option key={key} value={key} className="bg-navy text-ink">
                    {LENGTH_UNITS[key].label} ({LENGTH_UNITS[key].symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="diameter" className="mb-2 text-xs text-mist">
                  Internal diameter ({LENGTH_UNITS[unit].symbol})
                </Label>
                <Input
                  id="diameter"
                  inputMode="decimal"
                  value={diameter}
                  onChange={(event) => setDiameter(event.target.value)}
                  placeholder="e.g. 12"
                  className="h-11 border-edge bg-abyss/70 text-ink placeholder:text-mist/50"
                />
              </div>
              <div>
                <Label htmlFor="second" className="mb-2 text-xs text-mist">
                  {secondLabel} ({LENGTH_UNITS[unit].symbol})
                </Label>
                <Input
                  id="second"
                  inputMode="decimal"
                  value={second}
                  onChange={(event) => setSecond(event.target.value)}
                  placeholder={geometry === "vertical-cylinder" ? "e.g. 9" : "e.g. 24"}
                  className="h-11 border-edge bg-abyss/70 text-ink placeholder:text-mist/50"
                />
              </div>
            </div>
            <p className="text-[11px] leading-5 text-mist/80">
              Dimensions are internal, not external. Walls, fittings, internal
              structures and dead stock are not modelled, and a circumference
              measured on the outside cannot be used directly.
            </p>
          </div>

          <div className="border-t border-edge/60 pt-5">
            <div className="flex items-center gap-2">
              <Beaker className="size-4 text-mint" />
              <p className="eyebrow">Optional · nominal mass estimate</p>
            </div>
            <div className="mt-3">
              <Label htmlFor="density" className="mb-2 text-xs text-mist">
                Liquid density (kg/m³), optional
              </Label>
              <Input
                id="density"
                inputMode="decimal"
                value={density}
                onChange={(event) => setDensity(event.target.value)}
                placeholder={`e.g. 840 (between ${DENSITY_LIMITS.minKgPerCubicMeter} and ${DENSITY_LIMITS.maxKgPerCubicMeter})`}
                className="h-11 border-edge bg-abyss/70 text-ink placeholder:text-mist/50"
              />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-mist/80">
              This assumes the entire theoretical capacity is filled with a liquid
              of the stated density at one temperature. It is an estimate of mass
              at full capacity, not a measured inventory.
            </p>
            {mass && !mass.ok && (
              <p className="mt-2 text-[11px] text-warn">{mass.problem.message}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-edge/60 pt-5">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!outcome.ok || saving}
              className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save calculation
            </Button>
            <Link
              to="/workspace/history?tab=calculations"
              className="inline-flex items-center gap-1.5 text-xs text-mist transition hover:text-ink"
            >
              Saved calculations <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {saveMessage && (
            <p className="rounded-lg border border-emerald/30 bg-emerald/[0.06] px-3 py-2 text-xs leading-5 text-mint">
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
              {saveError}
            </p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="space-y-4">
            <SectionHeading eyebrow="Result" title="Theoretical geometric capacity" />
            {outcome.ok ? (
              <>
                <div className="rounded-xl border border-emerald/30 bg-emerald/[0.06] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mint">
                    volume
                  </p>
                  <p className="mt-1 font-display text-3xl font-medium text-emerald">
                    {formatVolume(outcome.calculation.volume.cubicMeters, 6)}{" "}
                    <span className="text-lg text-mint">m³</span>
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-mist">
                    {outcome.calculation.formula} · r ={" "}
                    {formatVolume(outcome.calculation.radiusM, 6)} m
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile
                    label="litres"
                    value={formatVolume(outcome.calculation.volume.liters, 3)}
                  />
                  <StatTile
                    label="US gallons"
                    value={formatVolume(outcome.calculation.volume.usGallons, 3)}
                  />
                  <StatTile
                    label="oil barrels (42 US gal)"
                    value={formatVolume(outcome.calculation.volume.oilBarrels, 4)}
                  />
                  <StatTile
                    label="engine"
                    value={<span className="text-sm">{ENGINE_VERSION}</span>}
                    hint="double precision, no intermediate rounding"
                  />
                </div>
                {mass?.ok && (
                  <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
                      estimated mass at full capacity
                    </p>
                    <p className="mt-1 font-display text-xl text-ink">
                      {formatVolume(mass.tonnes, 3)} t
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-mist">
                      {formatVolume(mass.kilograms, 1)} kg at{" "}
                      {formatVolume(mass.densityKgPerCubicMeter, 1)} kg/m³.
                      ESTIMATED — not a measurement.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink">
                  Enter both internal dimensions to compute a capacity.
                </p>
                <ul className="space-y-2">
                  {outcome.problems.map((problem) => (
                    <li
                      key={`${problem.field}-${problem.code}`}
                      className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.05] px-3 py-2 text-[11px] leading-4 text-warn"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {problem.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel className="space-y-3">
            <p className="eyebrow">Four quantities that are not interchangeable</p>
            <div className="space-y-2">
              <QuantityRow
                label="Theoretical geometric capacity"
                value={
                  outcome.ok
                    ? `${formatVolume(outcome.calculation.volume.cubicMeters, 6)} m³`
                    : "not computed"
                }
                note="Exact for an ideal cylinder with the entered internal dimensions."
                tone="pass"
              />
              <QuantityRow
                label="Nominal tank capacity"
                value="not available"
                note="Requires manufacturer data or a calibration certificate."
                tone="absent"
              />
              <QuantityRow
                label="Usable capacity"
                value="not available"
                note="Requires tank-specific dead stock, nozzle and safety limits."
                tone="absent"
              />
              <QuantityRow
                label="Measured liquid inventory"
                value="not measurable"
                note="Requires a verified liquid-level measurement, temperature and product data. Imagery can never supply it."
                tone="blocked"
              />
            </div>
          </Panel>

          <Callout
            tone="warn"
            icon={ShieldAlert}
            title="Partial fill is deliberately not implemented"
          >
            Horizontal-cylinder partial-fill volume needs a circular-segment
            formula, a defined liquid-level reference and validated reference
            values before release. Until that validation exists, only full
            capacity is offered — a wrong partial-fill number would be worse than
            none.
          </Callout>
        </div>
      </div>
    </div>
  );
}

function QuantityRow({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "pass" | "absent" | "blocked";
}) {
  const tones = {
    pass: "border-emerald/30 bg-emerald/[0.06] text-emerald",
    absent: "border-edge bg-abyss/60 text-mist",
    blocked: "border-warn/30 bg-warn/[0.05] text-warn",
  } as const;
  return (
    <div className={cn("rounded-xl border p-3.5", tones[tone])}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em]">{value}</p>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-mist">{note}</p>
    </div>
  );
}
