import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FootprintMap } from "@/components/workspace/FootprintMap";
import { ImagePreview } from "@/components/workspace/ImagePreview";
import {
  Callout,
  EmptyState,
  Field,
  InlineSpinner,
  Panel,
  SectionHeading,
  StatTile,
  StatusPill,
} from "@/components/workspace/primitives";
import { ValidationList } from "@/components/workspace/ValidationList";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  datePartOf,
  formatCloudCover,
  formatCoordinate,
  formatResolution,
  platformLabel,
} from "@/lib/catalogue";
import { formatBytes } from "@/lib/image-quality";
import {
  buildResearchReport,
  downloadTextFile,
  reportFilename,
  reportToMarkdown,
} from "@/lib/report";
import type { CalculationRecord, ResearchProjectRecord } from "@/lib/research-types";
import {
  buildCalculationChecks,
  overallStatus,
  STATUS_GLOSSARY,
  summarizeChecks,
  type CheckStatus,
} from "@/lib/scientific-validation";
import { formatVolume } from "@/lib/tank-geometry";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Printer,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

const TABS = ["imagery", "analysis", "validation", "report"] as const;
type TabKey = (typeof TABS)[number];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.includes(searchParams.get("tab") as TabKey)
    ? (searchParams.get("tab") as TabKey)
    : "imagery";

  const rawId = id ?? "";
  const isValidProjectId = /^[a-zA-Z0-9]{16,64}$/.test(rawId);
  const projectId = isValidProjectId
    ? (rawId as Id<"researchProjects">)
    : undefined;
  const project = useQuery(
    api.projects.get,
    projectId ? { id: projectId } : "skip",
  );
  const calculations = useQuery(
    api.calculations.listForProject,
    projectId ? { projectId } : "skip",
  );
  const settings = useQuery(api.settings.get);
  const removeProject = useMutation(api.projects.remove);
  const clearAnalysis = useMutation(api.projects.clearAnalysis);
  const runInterpretation = useAction(api.ai.interpret);

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiInfo = useQuery(api.aiStatus.status);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const record = project ? (project as unknown as ResearchProjectRecord) : null;
  const checks = useMemo(() => record?.checks ?? [], [record]);
  const summary = useMemo(() => summarizeChecks(checks), [checks]);
  const scene = record?.scene ?? null;
  const upload = record?.upload ?? null;
  const latestCalculation = (calculations?.[0] ?? null) as CalculationRecord | null;

  const report = useMemo(() => {
    if (!record) return null;
    return buildResearchReport(
      record,
      (calculations ?? []) as unknown as CalculationRecord[],
    );
  }, [record, calculations]);

  const handleTab = (value: string) => {
    const next = value as TabKey;
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const handleRunAi = async () => {
    if (!projectId) return;
    setAiRunning(true);
    setAiError(null);
    try {
      const result = await runInterpretation({ projectId });
      if (result.status !== "ok") {
        setAiError(result.message);
      }
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "The AI interpretation did not complete.",
      );
    } finally {
      setAiRunning(false);
    }
  };

  const handleClearAi = async () => {
    if (!projectId) return;
    setAiError(null);
    try {
      await clearAnalysis({ projectId });
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Commentary could not be cleared.",
      );
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeProject({ id: projectId });
      navigate("/workspace/history");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "The record could not be deleted.",
      );
      setDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!record) return;
    const fresh = buildResearchReport(
      record,
      (calculations ?? []) as unknown as CalculationRecord[],
      new Date(),
    );
    downloadTextFile(reportFilename(record), reportToMarkdown(fresh));
  };

  if (!isValidProjectId) {
    return (
      <EmptyState
        icon={FileText}
        title="That record reference is not valid"
        description="The link does not contain a valid research record identifier, so no query was sent to the database."
        action={
          <Button asChild className="bg-emerald text-[#04130f] hover:bg-emerald/90">
            <Link to="/workspace/history">Back to history</Link>
          </Button>
        }
      />
    );
  }

  if (project === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <InlineSpinner label="Loading research record…" />
      </div>
    );
  }

  if (project === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Research record not found"
        description="It may have been deleted, or it may belong to another account. Records are scoped to the signed-in user."
        action={
          <Button asChild className="bg-emerald text-[#04130f] hover:bg-emerald/90">
            <Link to="/workspace/history">Back to history</Link>
          </Button>
        }
      />
    );
  }

  if (!record) return null;

  const acquiredDate = scene ? datePartOf(scene.acquiredAt) : null;
  const calculationCount = calculations?.length ?? 0;

  const processingSteps: {
    label: string;
    status: CheckStatus;
    detail: string;
  }[] = [
    {
      label: "Metadata extraction",
      status: scene || upload ? "PASS" : "NOT APPLICABLE",
      detail: scene
        ? "Provider STAC fields normalised into the record. Fields the provider did not return stay empty."
        : "Browser-decoded file properties and editable EXIF extracted where present.",
    },
    {
      label: "Source & acquisition validation",
      status: scene
        ? record.dateMatch === "exact"
          ? "PASS"
          : "WARN"
        : "NOT VERIFIED",
      detail: scene
        ? record.dateMatch === "exact"
          ? "Provider acquisition date agrees with the requested capture date."
          : "The user-selected nearby date differs from the request and is flagged in this record."
        : "Uploaded file is not an authenticated satellite product; declared date is unverified.",
    },
    {
      label: "Resolution assessment",
      status: scene
        ? scene.resolutionM !== null
          ? "PASS"
          : "NOT MEASURABLE"
        : "NOT MEASURABLE",
      detail: scene
        ? scene.resolutionM !== null
          ? `Provider-declared ground sample distance is ${formatResolution(scene.resolutionM)}.`
          : "The provider did not declare a ground sample distance."
        : "Ground scale cannot be recovered from an uploaded file without acquisition geometry.",
    },
    {
      label: "Image-quality checks",
      status: scene
        ? scene.cloudCoverPct === null
          ? "NOT MEASURABLE"
          : scene.cloudCoverPct > 10
            ? "WARN"
            : "PASS"
        : upload?.clientMetrics
          ? "WARN"
          : "NOT MEASURABLE",
      detail: scene
        ? `Provider-reported tile-level cloud cover: ${formatCloudCover(scene.cloudCoverPct)}. This describes the scene tile, not your target.`
        : upload?.clientMetrics
          ? "Heuristic luma statistics computed in the browser. They are not a radiometric assessment."
          : "No pixel statistics are stored for this upload.",
    },
    {
      label: "Supported visual analysis",
      status: scene ? "NOT VERIFIED" : upload?.clientMetrics ? "WARN" : "NOT MEASURABLE",
      detail: scene
        ? "No pixel-level analysis is run on the cross-origin quicklook. Only provider metadata and provider tile statistics are used."
        : "Only brightness, contrast and focus proxies are available. No object detection, segmentation or measurement is claimed.",
    },
    {
      label: "Scientific validation",
      status: checks.length === 0 ? "NOT APPLICABLE" : summary.fail > 0 ? "FAIL" : "PASS",
      detail: `${summary.total} deterministic check(s) recorded: ${summary.headline}.`,
    },
    {
      label: "Calculation eligibility",
      status: calculationCount > 0 ? "PASS" : "NOT APPLICABLE",
      detail:
        calculationCount > 0
          ? `${calculationCount} theoretical capacity calculation(s) attached. Dimensions remain user-supplied and unverified.`
          : "No tank calculation is attached. No numerical result is asserted by this record.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 print-hide">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mist">
          <Link to="/workspace/history" className="hover:text-ink">
            History
          </Link>
          <span>/</span>
          <span className="text-mint">{record.source === "catalogue" ? "catalogue record" : "upload record"}</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-medium leading-tight tracking-tight text-ink sm:text-3xl">
              {record.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={overallStatus(checks)} />
              <span className="rounded-full border border-edge/70 bg-abyss/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                {record.dateMatch === "exact"
                  ? "exact acquisition date"
                  : record.dateMatch === "window"
                    ? "user-selected window"
                    : "upload · date unverified"}
              </span>
              <span className="font-mono text-[10px] text-mist/70">
                created {new Date(record.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print-hide">
            <Button
              asChild
              variant="outline"
              className="gap-2 border-edge bg-transparent text-ink hover:bg-deepgreen/40"
            >
              <Link to={`/workspace/calculator?project=${record._id}`}>
                <Calculator className="size-4" /> Attach calculation
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-danger/30 bg-transparent text-danger hover:bg-danger/10"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-3 print-hide sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="requested capture date"
            value={<span className="font-mono text-base">{record.requestedDate}</span>}
            hint="as entered by you"
          />
          <StatTile
            label="actual acquisition"
            value={
              <span className="font-mono text-base">
                {acquiredDate ?? "not available"}
              </span>
            }
            hint={scene ? "from the provider timestamp" : "no provider record"}
            emphasis={Boolean(acquiredDate)}
          />
          <StatTile
            label="resolution"
            value={scene ? formatResolution(scene.resolutionM) : "not measurable"}
            hint={scene ? "provider-declared" : "ground scale unknown"}
          />
          <StatTile
            label="validation"
            value={`${summary.total} checks`}
            hint={summary.headline}
          />
        </div>
      </div>

      {confirmingDelete && (
        <Panel className="border-danger/40 print-hide">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-sm font-medium text-ink">
                Delete this research record?
              </p>
              <p className="mt-1 text-xs leading-5 text-mist">
                This removes the record
                {upload ? ", the stored image" : ""} and any linked calculations.
                It cannot be undone.
              </p>
              {deleteError && (
                <p className="mt-2 text-xs text-danger">{deleteError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="text-mist"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="gap-2 bg-danger text-[#1a0507] hover:bg-danger/90"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                Delete permanently
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Tabs value={tab} onValueChange={handleTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-edge/70 bg-abyss/60 p-1 no-scrollbar print-hide">
          {[
            { key: "imagery", label: "Imagery & metadata", icon: ImageIcon },
            { key: "analysis", label: "AI commentary", icon: BrainCircuit },
            { key: "validation", label: "Validation", icon: ShieldAlert },
            { key: "report", label: "Report", icon: FileText },
          ].map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-deepgreen data-[state=active]:text-ink"
            >
              <item.icon className="size-3.5" />
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="imagery" className="mt-4 space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <div className="space-y-5">
              <Panel className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">Image viewer</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                    {scene ? "provider quicklook" : "user upload"}
                  </span>
                </div>
                <ImagePreview
                  src={scene?.thumbnailUrl ?? project.imageUrl ?? null}
                  alt={
                    scene
                      ? `Provider quicklook for ${scene.itemId}`
                      : `Uploaded image ${upload?.filename ?? ""}`
                  }
                  caption={
                    scene
                      ? "Rendered provider quicklook for orientation only. It is not radiometric data and nothing in this app measures it."
                      : "The file you uploaded, served from protected storage. Provenance, ground scale and capture date are not independently verified."
                  }
                  note={
                    scene
                      ? `provider · ${scene.providerName}`
                      : `sha-256 · ${upload?.sha256?.slice(0, 32) ?? "unavailable"}`
                  }
                />
                {scene && scene.statistics.length > 0 && (
                  <div>
                    <p className="eyebrow">Provider tile classification</p>
                    <div className="mt-3 space-y-2">
                      {scene.statistics.slice(0, 8).map((entry) => (
                        <div key={entry.label} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-mist">
                            {entry.label}
                          </span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-deepgreen/60">
                            <span
                              className="block h-full rounded-full bg-emerald/70"
                              style={{
                                width: `${Math.max(0, Math.min(100, entry.value))}%`,
                              }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right font-mono text-[10px] text-mint">
                            {entry.value}%
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-mist/60">
                      Tile-level statistics reported by the provider. They describe
                      the whole scene tile, not your target.
                    </p>
                  </div>
                )}
              </Panel>

              {scene ? (
                <Panel>
                  <p className="eyebrow">Catalogue metadata</p>
                  <dl className="mt-3">
                    <Field label="Provider" value={scene.providerName} />
                    <Field
                      label="Collection"
                      value={`${scene.collectionName} (${scene.collectionId})`}
                    />
                    <Field
                      label="Product / scene identifier"
                      value={scene.itemId}
                      mono
                      breakAll
                    />
                    <Field
                      label="Acquisition timestamp (UTC)"
                      value={scene.acquiredAt}
                      mono
                    />
                    <Field
                      label="Processed / published"
                      value={scene.publishedAt ?? "not reported"}
                      mono
                    />
                    <Field
                      label="Catalogue record updated"
                      value={scene.updatedAt ?? "not reported"}
                      mono
                    />
                    <Field label="Platform" value={platformLabel(scene.platform)} />
                    <Field label="Orbit" value={scene.orbitState ?? "not reported"} />
                    <Field label="MGRS grid" value={scene.gridCode ?? "not reported"} />
                    <Field
                      label="Spatial resolution"
                      value={formatResolution(scene.resolutionM)}
                    />
                    <Field
                      label="Cloud cover"
                      value={formatCloudCover(scene.cloudCoverPct)}
                    />
                    <Field
                      label="Footprint bbox"
                      value={
                        scene.bbox
                          ? scene.bbox.map((value) => value.toFixed(4)).join(", ")
                          : "not returned"
                      }
                      mono
                    />
                    <Field
                      label="Licence"
                      value="Copernicus Sentinel Data Legal Notice"
                      href={scene.licenseUrl}
                    />
                    {scene.selfUrl && (
                      <Field
                        label="Provider record"
                        value="Open catalogue item"
                        href={scene.selfUrl}
                      />
                    )}
                  </dl>
                  <p className="mt-3 rounded-lg border border-edge/60 bg-abyss/50 px-3 py-2 text-[10px] leading-4 text-mist/70">
                    {scene.attribution}. Acquisition date comes from the provider
                    timestamp; it is not inferred from the processing or ingestion
                    date.
                  </p>
                </Panel>
              ) : (
                upload && (
                  <Panel>
                    <p className="eyebrow">Uploaded file metadata</p>
                    <dl className="mt-3">
                      <Field label="Filename" value={upload.filename} breakAll />
                      <Field label="Declared type" value={upload.contentType} mono />
                      <Field label="Size" value={formatBytes(upload.sizeBytes)} />
                      <Field
                        label="Dimensions"
                        value={
                          upload.width && upload.height
                            ? `${upload.width} × ${upload.height} px`
                            : "not decoded"
                        }
                      />
                      <Field
                        label="Declared capture date"
                        value={upload.declaredCaptureDate}
                        mono
                      />
                      <Field
                        label="EXIF status"
                        value={upload.exifStatus}
                      />
                      <Field
                        label="EXIF DateTimeOriginal"
                        value={upload.exifDateOriginal ?? "not present"}
                        mono
                      />
                      <Field
                        label="EXIF camera"
                        value={
                          upload.exifMake || upload.exifModel
                            ? `${upload.exifMake ?? "—"} / ${upload.exifModel ?? "—"}`
                            : "not reported"
                        }
                      />
                      <Field
                        label="EXIF GPS"
                        value={upload.exifHasGps ? "present (not used for search)" : "absent"}
                      />
                      <Field
                        label="SHA-256"
                        value={upload.sha256 ?? "unavailable"}
                        mono
                        breakAll
                      />
                    </dl>
                    {upload.clientMetrics && (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <StatTile
                          label="mean luma"
                          value={upload.clientMetrics.meanLuma.toFixed(1)}
                          hint="/ 255, heuristic"
                        />
                        <StatTile
                          label="contrast σ"
                          value={upload.clientMetrics.stdDevLuma.toFixed(1)}
                          hint="luma std deviation"
                        />
                        <StatTile
                          label="focus proxy"
                          value={upload.clientMetrics.laplacianVariance.toFixed(1)}
                          hint="Laplacian variance"
                        />
                      </div>
                    )}
                    <p className="mt-3 text-[10px] leading-4 text-mist/70">
                      Browser-computed statistics. They describe the pixels you
                      uploaded, not a verified satellite product.
                    </p>
                  </Panel>
                )
              )}

              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">Processing pipeline</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">
                    real status per step
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {processingSteps.map((step) => (
                    <li
                      key={step.label}
                      className="flex flex-col gap-1.5 rounded-lg border border-edge/50 bg-abyss/40 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{step.label}</p>
                        <p className="mt-1 text-[11px] leading-4 text-mist">
                          {step.detail}
                        </p>
                      </div>
                      <StatusPill status={step.status} className="self-start" />
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel>
                <p className="eyebrow">Spatial footprint</p>
                <div className="mt-3">
                  <FootprintMap
                    bbox={scene?.bbox ?? null}
                    geometry={scene?.geometry ?? null}
                    label={record.title}
                    center={record.location ?? null}
                  />
                </div>
                {record.location && (
                  <dl className="mt-4">
                    <Field
                      label="Requested location"
                      value={record.location.label}
                      breakAll
                    />
                    <Field
                      label="Coordinates"
                      value={formatCoordinate(record.location.lat, record.location.lon)}
                      mono
                    />
                    <Field
                      label="Search area bbox"
                      value={record.location.bbox
                        .map((value) => Number(value).toFixed(4))
                        .join(", ")}
                      mono
                    />
                    <Field label="Geocoder" value={record.location.source} />
                  </dl>
                )}
              </Panel>

              {scene && (
                <Panel>
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm text-ink">
                      <span className="flex items-center gap-2">
                        <ScanLine className="size-4 text-emerald" />
                        Provider assets ({scene.assets.length})
                      </span>
                      <span className="font-mono text-[10px] text-mist">
                        auth shown
                      </span>
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {scene.assets.slice(0, 24).map((asset) => (
                        <li
                          key={asset.key}
                          className="rounded-lg border border-edge/50 bg-abyss/40 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-mint">
                              {asset.key}
                            </span>
                            <span
                              className={cn(
                                "font-mono text-[9px] uppercase tracking-[0.1em]",
                                asset.requiresAuth ? "text-warn" : "text-emerald",
                              )}
                            >
                              {asset.requiresAuth ? "auth required" : "public"}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-4 text-mist">
                            {asset.title}
                            {asset.gsdM ? ` · ${asset.gsdM} m` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] leading-4 text-mist/60">
                      Asset links are shown for metadata only. Pixel downloads
                      require Copernicus authentication and are not requested by
                      this app.
                    </p>
                  </details>
                </Panel>
              )}

              <Callout tone="info" icon={Info} title="Status meaning">
                <ul className="space-y-1.5">
                  {STATUS_GLOSSARY.slice(0, 4).map((entry) => (
                    <li key={entry.status}>
                      <span className="font-mono text-[10px] text-mint">
                        {entry.status}
                      </span>{" "}
                      — {entry.meaning}
                    </li>
                  ))}
                </ul>
              </Callout>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4 space-y-5">
          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Model commentary · not a measurement"
              title="AI interpretation of the recorded metadata"
              description="The model receives metadata text only: no image pixels and no exact coordinates. It cannot change a validation status or produce a calculation."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-edge/60 bg-abyss/50 p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  adapter
                </p>
                <p className="mt-1 text-sm text-ink">
                  {aiInfo ? aiInfo.adapter : "checking…"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-mist">
                  model · {aiInfo?.model ?? "unknown"}
                </p>
              </div>
              <div className="rounded-xl border border-edge/60 bg-abyss/50 p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  availability
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm",
                    aiInfo?.configured ? "text-emerald" : "text-warn",
                  )}
                >
                  {aiInfo
                    ? aiInfo.configured
                      ? "configured at runtime"
                      : "no integration key"
                    : "checking…"}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-mist">
                  {aiInfo?.note ?? ""}
                </p>
              </div>
            </div>

            <details className="rounded-xl border border-edge/60 bg-abyss/40 p-4">
              <summary className="cursor-pointer text-xs text-ink">
                Model card · intended use, output schema and failure behaviour
              </summary>
              <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {[
                  [
                    "Model and version",
                    "gpt-4o-mini via the deployment AI gateway, adapter @vly-ai/integrations 0.6.14",
                  ],
                  [
                    "Intended task",
                    "Interpret recorded catalogue/upload metadata and explain its limits in plain language.",
                  ],
                  [
                    "Required input",
                    "Metadata text only: location label, dates, provider identifiers, resolution, cloud cover and validation statuses. No pixels, no exact coordinates.",
                  ],
                  [
                    "Output schema",
                    "{ summary: string, sections: [{ title, body }], limitations: string[] } — validated before storage.",
                  ],
                  [
                    "Known limitations",
                    "Commentary can be wrong or incomplete. Provider tile statistics are not target-specific measurements. Model availability can change outside this app.",
                  ],
                  [
                    "Evaluation method",
                    "Schema validation and forbidden-claim constraints only. No accuracy benchmark has been run.",
                  ],
                  [
                    "Failure behaviour",
                    "Unusable output is rejected and nothing is stored. A previous commentary is left untouched.",
                  ],
                  [
                    "Test results",
                    "Not executed end-to-end in this session. Availability depends on a runtime key and is reported honestly above.",
                  ],
                ].map(([term, detail]) => (
                  <div key={term}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">
                      {term}
                    </dt>
                    <dd className="mt-0.5 text-[11px] leading-4 text-mist">
                      {detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>

            {settings && !settings.aiEnabled && (
              <Callout tone="warn" title="AI is disabled in settings" icon={ShieldAlert}>
                Deterministic validation still runs. Enable AI commentary in{" "}
                <Link to="/workspace/settings" className="underline underline-offset-4">
                  Settings → Privacy
                </Link>{" "}
                if you want the model called.
              </Callout>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleRunAi()}
                disabled={
                  aiRunning ||
                  !projectId ||
                  aiInfo?.configured === false ||
                  settings?.aiEnabled === false
                }
                className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
              >
                {aiRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {aiRunning ? "Model is running…" : "Run AI interpretation"}
              </Button>
              {record.analysis && (
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 text-mist hover:text-ink"
                  onClick={() => void handleClearAi()}
                >
                  <Trash2 className="size-4" /> Clear commentary
                </Button>
              )}
              {aiError && <span className="text-xs text-danger">{aiError}</span>}
            </div>
            {aiRunning && (
              <InlineSpinner label="Sending metadata text and waiting for a structured response…" />
            )}

            {record.analysis ? (
              <div className="space-y-4 rounded-xl border border-edge/70 bg-abyss/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
                    <BrainCircuit className="size-3" /> model commentary
                  </span>
                  <span className="font-mono text-[10px] text-mist">
                    {record.analysis.model} ·{" "}
                    {new Date(record.analysis.ranAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                    {record.analysis.credits !== null
                      ? ` · ${record.analysis.credits} credits`
                      : ""}
                  </span>
                </div>
                <p className="text-sm leading-6 text-ink">{record.analysis.summary}</p>
                <div className="space-y-3">
                  {record.analysis.sections.map((section, index) => (
                    <div
                      key={`${section.title}-${index}`}
                      className="border-t border-edge/50 pt-3"
                    >
                      <p className="font-display text-sm font-medium text-ink">
                        {section.title}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-mist">
                        {section.body}
                      </p>
                    </div>
                  ))}
                </div>
                {record.analysis.limitations.length > 0 && (
                  <div className="rounded-lg border border-warn/25 bg-warn/[0.04] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-warn">
                      model-stated limitations
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-4 text-mist">
                      {record.analysis.limitations.map((limitation, index) => (
                        <li key={index}>{limitation}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] leading-4 text-mist/60">
                  Model output is separated from verified observations and from
                  deterministic calculations. Confidence is not correctness, and
                  no status in this record depends on this text.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-edge/70 bg-abyss/30 p-6 text-center">
                <BrainCircuit className="mx-auto size-5 text-mist" />
                <p className="mt-2 text-sm text-ink">No commentary stored</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-mist">
                  AI is optional. The record is complete without it: metadata,
                  validation and any calculation stand on deterministic evidence.
                </p>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="validation" className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="checks" value={summary.total} />
            <StatTile label="pass" value={summary.pass} />
            <StatTile label="warn" value={summary.warn} />
            <StatTile label="fail" value={summary.fail} />
            <StatTile label="not measurable" value={summary.notMeasurable} />
            <StatTile label="not verified" value={summary.notVerified} />
          </div>

          <Panel>
            <SectionHeading
              eyebrow="Rule-by-rule record"
              title="Validation details"
              description="Every check is produced by a deterministic rule and carries the basis of its evidence. AI cannot add, remove or upgrade a check."
            />
            <div className="mt-4">
              <ValidationList checks={checks} />
            </div>
          </Panel>

          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Tank calculation linkage"
              title="Theoretical capacity attached to this record"
              description="Capacity is computed from your internal dimensions. It is not measured from the image, and it is not inventory."
              actions={
                <Button
                  asChild
                  variant="outline"
                  className="gap-2 border-edge bg-transparent text-ink"
                >
                  <Link to={`/workspace/calculator?project=${record._id}`}>
                    <Calculator className="size-4" /> Open calculator
                  </Link>
                </Button>
              }
            />
            {calculations === undefined ? (
              <InlineSpinner label="Loading calculations…" />
            ) : calculations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-edge/70 bg-abyss/30 px-4 py-5 text-xs leading-5 text-mist">
                No calculation is attached. The record still stands as catalogue
                metadata evidence; no numerical result has been invented for it.
              </p>
            ) : (
              <div className="space-y-3">
                {(calculations as unknown as CalculationRecord[]).map((calculation) => (
                  <div
                    key={calculation._id}
                    className="rounded-xl border border-edge/60 bg-abyss/40 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink">{calculation.geometryLabel}</p>
                      <p className="font-display text-base text-emerald">
                        {formatVolume(calculation.volume.cubicMeters, 6)} m³
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-[10px] leading-4 text-mist">
                      {calculation.formula} · {formatVolume(calculation.volume.liters, 3)} L
                      · {formatVolume(calculation.volume.usGallons, 3)} US gal ·{" "}
                      {formatVolume(calculation.volume.oilBarrels, 4)} bbl ·{" "}
                      {calculation.engineVersion}
                    </p>
                  </div>
                ))}
                <div className="mt-4">
                  <p className="eyebrow">Calculation checks</p>
                  <div className="mt-3">
                    <ValidationList
                      checks={buildCalculationChecks(
                        latestCalculation
                          ? {
                              geometryLabel: latestCalculation.geometryLabel,
                              volumeM3: latestCalculation.volume.cubicMeters,
                              engineVersion: latestCalculation.engineVersion,
                              createdAt: latestCalculation.createdAt,
                            }
                          : null,
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Callout
            tone="warn"
            icon={ShieldAlert}
            title="What remains unverified in this record"
          >
            The numerical arithmetic is deterministic and tested. The physical
            dimensions, georeferencing and any imagery-derived feature measurement
            remain unverified, and no image-derived tank dimension or liquid level
            is claimed anywhere.
          </Callout>
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2 print-hide">
            <Button
              type="button"
              className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
              onClick={handleDownload}
            >
              <Download className="size-4" /> Download Markdown report
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-edge bg-transparent text-ink"
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> Print / save as PDF
            </Button>
          </div>

          <div className="print-area rounded-xl border border-edge/70 bg-abyss/40 p-5 sm:p-7">
            {report ? (
              <>
                <p className="eyebrow print-muted">Tank Calculator AI · research report</p>
                <h2 className="mt-2 font-display text-xl font-medium text-ink">
                  {record.title}
                </h2>
                <p className="mt-1 font-mono text-[10px] text-mist print-muted">
                  generated {report.generatedAt} · statuses reproduced as recorded
                </p>
                <div className="mt-5 space-y-5">
                  {report.sections.map((section) => (
                    <section key={section.heading}>
                      <h3 className="font-display text-sm font-medium text-ink">
                        {section.heading}
                      </h3>
                      <ul className="mt-1.5 space-y-1.5">
                        {section.lines.map((line, index) => (
                          <li
                            key={index}
                            className="text-[11px] leading-5 text-mist print-muted"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-edge/60 pt-4">
                  <CheckCircle2 className="size-4 text-emerald" />
                  <p className="text-[10px] leading-4 text-mist print-muted">
                    This report reproduces stored statuses. It does not promote an
                    estimate to a verified fact and contains no accuracy percentage.
                  </p>
                </div>
              </>
            ) : (
              <InlineSpinner label="Building report…" />
            )}
          </div>

          <div className="print-hide grid gap-3 sm:grid-cols-3">
            <StatTile label="provider" value={scene?.providerName ?? "upload"} />
            <StatTile
              label="attribution"
              value={
                <span className="text-xs leading-5">
                  {scene?.attribution ?? "User-supplied image — no Copernicus data"}
                </span>
              }
            />
            <a
              href="https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-xl border border-edge/70 bg-abyss/60 px-4 py-3 text-xs text-mint transition hover:border-emerald/40"
            >
              Sentinel Data Legal Notice
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </TabsContent>
      </Tabs>

      <div className="print-hide flex flex-wrap items-center gap-2 text-[11px] text-mist">
        <ArrowRight className="size-3.5" />
        <Link
          to="/workspace/history"
          className="transition hover:text-ink"
        >
          Back to project history
        </Link>
        <span className="text-mist/40">·</span>
        <Link
          to="/workspace"
          className="transition hover:text-ink"
        >
          Start another research request
        </Link>
      </div>

      {deleteError && !confirmingDelete && (
        <p className="flex items-center gap-2 text-xs text-danger">
          <AlertTriangle className="size-3.5" /> {deleteError}
        </p>
      )}
    </div>
  );
}
