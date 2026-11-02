import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  InlineSpinner,
  Panel,
  StatTile,
  StatusPill,
} from "@/components/workspace/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { datePartOf } from "@/lib/catalogue";
import { formatVolume } from "@/lib/tank-geometry";
import {
  overallStatus,
  summarizeChecks,
  type ValidationCheck,
} from "@/lib/scientific-validation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Calculator,
  Database,
  FileText,
  Loader2,
  Radar,
  Satellite,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "calculations" ? "calculations" : "records";
  const [recordLimit, setRecordLimit] = useState(40);
  const [calculationLimit, setCalculationLimit] = useState(40);
  const projects = useQuery(api.projects.list, { limit: recordLimit });
  const calculations = useQuery(api.calculations.list, {
    limit: calculationLimit,
  });
  const removeCalculation = useMutation(api.calculations.remove);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const list = projects ?? [];
    return {
      records: list.length,
      uploads: list.filter((project) => project.source === "upload").length,
      analysed: list.filter((project) => project.analysis !== null).length,
      calculations: calculations?.length ?? 0,
    };
  }, [projects, calculations]);

  const handleDelete = async (id: Id<"calculations">) => {
    setDeleting(id);
    setError(null);
    try {
      await removeCalculation({ id });
      setConfirming(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The calculation was not deleted.",
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Project history</p>
        <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          Stored research records
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
          Every record below is real stored data for your account. Counts are
          computed from those records, not from demonstration fixtures.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="loaded records"
          value={stats.records}
          hint={`up to ${recordLimit}`}
        />
        <StatTile
          label="image uploads"
          value={stats.uploads}
          hint="within those records"
        />
        <StatTile
          label="with AI commentary"
          value={stats.analysed}
          hint="within those records"
        />
        <StatTile
          label="loaded calculations"
          value={stats.calculations}
          hint={`up to ${calculationLimit}`}
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === "calculations") next.set("tab", "calculations");
          else next.delete("tab");
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-edge/70 bg-abyss/60 p-1 sm:w-auto">
          <TabsTrigger
            value="records"
            className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-deepgreen data-[state=active]:text-ink"
          >
            <Database className="size-3.5" /> Research records ({stats.records})
          </TabsTrigger>
          <TabsTrigger
            value="calculations"
            className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-deepgreen data-[state=active]:text-ink"
          >
            <Calculator className="size-3.5" /> Calculations ({stats.calculations})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="mt-4 space-y-3">
          {projects === undefined ? (
            <Panel>
              <InlineSpinner label="Loading research records…" />
            </Panel>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="No research records yet"
              description="Search a location and capture date, or upload an image, to create your first record."
              action={
                <Button asChild className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90">
                  <Link to="/workspace">
                    Start a research request <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          ) : (
            <>
              {projects.map((project) => {
              // Stored checks come from the schema validators; the shared
              // display helper keeps its own literal union for the basis field.
              const storedChecks = project.checks as unknown as ValidationCheck[];
              const summary = summarizeChecks(storedChecks);
              const acquisition = project.scene
                ? datePartOf(project.scene.acquiredAt)
                : null;
              return (
                <Link
                  key={project._id}
                  to={`/workspace/project/${project._id}`}
                  className="group block rounded-xl border border-edge/70 bg-panel/60 p-4 transition-colors hover:border-emerald/40 hover:bg-panel"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {project.source === "catalogue" ? (
                          <Satellite className="size-4 shrink-0 text-emerald" />
                        ) : (
                          <Upload className="size-4 shrink-0 text-mint" />
                        )}
                        <p className="truncate font-display text-sm font-medium text-ink">
                          {project.title}
                        </p>
                      </div>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mist">
                        <span>requested {project.requestedDate}</span>
                        <span>acquired {acquisition ?? "n/a"}</span>
                        <span>
                          {project.source === "catalogue"
                            ? project.scene?.collectionId ?? "catalogue"
                            : "upload · unverified"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={overallStatus(storedChecks)} />
                      <ArrowRight className="size-4 text-mist transition group-hover:translate-x-0.5 group-hover:text-emerald" />
                    </div>
                  </div>
                  <p className="mt-3 border-t border-edge/40 pt-2.5 text-[11px] leading-4 text-mist">
                    {summary.headline}
                    {project.analysis ? " · AI commentary stored" : ""}
                  </p>
                </Link>
              );
              })}
              {projects.length >= recordLimit && recordLimit < 200 && (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-edge bg-transparent text-ink"
                    onClick={() =>
                      setRecordLimit((limit) => Math.min(200, limit + 40))
                    }
                  >
                    <Database className="size-4" /> Load more records
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="calculations" className="mt-4 space-y-3">
          {calculations === undefined ? (
            <Panel>
              <InlineSpinner label="Loading calculations…" />
            </Panel>
          ) : calculations.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="No saved calculations"
              description="The tank calculator runs locally and can save a record recomputed by the server-side engine."
              action={
                <Button asChild className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90">
                  <Link to="/workspace/calculator">
                    Open calculator <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          ) : (
            calculations.map((calculation) => (
              <Panel key={calculation._id} flat className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-sm font-medium text-ink">
                      {calculation.geometryLabel}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-mist">
                      {calculation.formula} · {calculation.engineVersion} ·{" "}
                      {new Date(calculation.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}{" "}
                      UTC
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg text-emerald">
                      {formatVolume(calculation.volume.cubicMeters, 6)} m³
                    </p>
                    <p className="font-mono text-[10px] text-mist">
                      {formatVolume(calculation.volume.liters, 3)} L ·{" "}
                      {formatVolume(calculation.volume.oilBarrels, 4)} bbl
                    </p>
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-mist">
                  Internal diameter {formatVolume(calculation.diameterM, 3)} m ·{" "}
                  {calculation.heightM !== null ? "height" : "length"}{" "}
                  {formatVolume(calculation.heightM ?? calculation.lengthM ?? 0, 3)} m
                  · entered in {calculation.unit}
                </p>
                <div className="flex flex-wrap items-center gap-3 border-t border-edge/40 pt-2.5">
                  {calculation.projectId && (
                    <Link
                      to={`/workspace/project/${calculation.projectId}`}
                      className="inline-flex items-center gap-1.5 text-[11px] text-mint hover:text-emerald"
                    >
                      <FileText className="size-3.5" /> Linked record
                    </Link>
                  )}
                  {confirming === calculation._id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-warn">
                        Delete this saved calculation?
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-mist"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="h-7 gap-1.5 bg-danger px-2 text-[11px] text-[#1a0507] hover:bg-danger/90"
                        onClick={() => void handleDelete(calculation._id)}
                        disabled={deleting === calculation._id}
                      >
                        {deleting === calculation._id && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(calculation._id)}
                      className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-mist transition hover:text-danger"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  )}
                </div>
              </Panel>
            ))
          )}
          {(calculations?.length ?? 0) >= calculationLimit &&
            calculationLimit < 200 && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-edge bg-transparent text-ink"
                onClick={() =>
                  setCalculationLimit((limit) => Math.min(200, limit + 40))
                }
              >
                <Calculator className="size-4" /> Load more calculations
              </Button>
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
