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
          : "The AI commentary did not finish.",
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
        error instanceof Error ? error.message : "The commentary was not cleared.",
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
        error instanceof Error ? error.message : "The record was not deleted.",
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
        title="That record link is not valid"
        description="The link does not contain a valid research record ID, so the app did not ask the database."
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
        <InlineSpinner label="Loading record…" />
      </div>
    );
  }

  if (project === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Research record not found"
        description="It may have been deleted, or it may belong to another account. Records are tied to the signed-in user."
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
      label: "Read image data",
      status: scene || upload ? "PASS" : "NOT APPLICABLE",
      detail: scene
        ? "Copernicus fields were copied into the record. Fields Copernicus did not return stay empty."
        : "The browser read the file details and any editable EXIF data.",
    },
    {
      label: "Check source and date",
      status: scene
        ? record.dateMatch === "exact"
          ? "PASS"
          : "WARN"
        : "NOT VERIFIED",
      detail: scene
        ? record.dateMatch === "exact"
          ? "The Copernicus UTC date matches the UTC date you requested."
          : "The date is near your request but not the same. The record flags this."
        : "This is an uploaded file, not a checked satellite product. The date is not proven.",
    },
    {
      label: "Check pixel size",
      status: scene
        ? scene.resolutionM !== null
          ? "PASS"
          : "NOT MEASURABLE"
        : "NOT MEASURABLE",
      detail: scene
        ? scene.resolutionM !== null
          ? `Copernicus reports a pixel size of ${formatResolution(scene.resolutionM)}.`
          : "Copernicus did not report a pixel size."
        : "An uploaded file has no capture geometry, so its ground scale is unknown.",
    },
    {
      label: "Check image quality",
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
        ? `Copernicus reports tile-level cloud cover of ${formatCloudCover(scene.cloudCoverPct)}. This is for the whole tile, not your target.`
        : upload?.clientMetrics
          ? "Basic brightness numbers from the browser. They are not a scientific image assessment."
          : "No image statistics are stored for this upload.",
    },
    {
      label: "Visual analysis",
      status: scene ? "NOT VERIFIED" : upload?.clientMetrics ? "WARN" : "NOT MEASURABLE",
      detail: scene
        ? "The app does not analyse pixels in the Copernicus preview. It uses only Copernicus image data and tile statistics."
        : "Only simple brightness, contrast and focus numbers are available. The app does not detect objects, draw outlines or measure features.",
    },
    {
      label: "Rule checks",
      status: checks.length === 0 ? "NOT APPLICABLE" : summary.fail > 0 ? "FAIL" : "PASS",
      detail: `${summary.total} fixed check(s) recorded: ${summary.headline}.`,
    },
    {
      label: "Tank calculation",
      status: calculationCount > 0 ? "PASS" : "NOT APPLICABLE",
      detail:
        calculationCount > 0
          ? `${calculationCount} capacity calculation(s) attached. The sizes came from you and are not checked.`
          : "No tank calculation is attached. The record does not claim a number.",
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
          <span className="text-mint">{record.source === "catalogue" ? "Copernicus record" : "upload record"}</span>
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
                  ? "exact UTC date"
                  : record.dateMatch === "window"
                    ? "UTC date range"
                    : "upload · UTC date not checked"}
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
                <Calculator className="size-4" /> Add calculation
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
            label="UTC date you asked for"
            value={<span className="font-mono text-base">{record.requestedDate}</span>}
            hint="as entered by you"
          />
          <StatTile
            label="image captured (UTC date)"
            value={
              <span className="font-mono text-base">
                {acquiredDate ?? "not available"}
              </span>
            }
            hint={scene ? "from Copernicus" : "no supplier record"}
            emphasis={Boolean(acquiredDate)}
          />
          <StatTile
            label="resolution"
            value={scene ? formatResolution(scene.resolutionM) : "cannot measure"}
            hint={scene ? "reported by Copernicus" : "ground scale unknown"}
          />
          <StatTile
            label="checks"
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
            { key: "imagery", label: "Image and data", icon: ImageIcon },
            { key: "analysis", label: "AI notes", icon: BrainCircuit },
            { key: "validation", label: "Checks", icon: ShieldAlert },
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
                  <p className="eyebrow">Image</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                    {scene ? "Copernicus preview" : "your upload"}
                  </span>
                </div>
                <ImagePreview
                  src={scene?.thumbnailUrl ?? project.imageUrl ?? null}
                  alt={
                    scene
                      ? `Preview from Copernicus for ${scene.itemId}`
                      : `Uploaded image ${upload?.filename ?? ""}`
                  }
                  caption={
                    scene
                      ? "A Copernicus preview for orientation only. It is not measurement data, and the app does not measure it."
                      : "The file you uploaded, served from protected storage. Its source, ground scale and UTC date are not independently checked."
                  }
                  note={
                    scene
                      ? `source · ${scene.providerName}`
                      : `sha-256 · ${upload?.sha256?.slice(0, 32) ?? "unavailable"}`
                  }
                />
                {scene && scene.statistics.length > 0 && (
                  <div>
                    <p className="eyebrow">Copernicus tile breakdown</p>
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
These numbers are for the whole tile, as reported by Copernicus. They
                      do not describe your target.
                    </p>
                  </div>
                )}
              </Panel>

              {scene ? (
                <Panel>
                  <p className="eyebrow">Image data from Copernicus</p>
                  <dl className="mt-3">
                    <Field label="Source" value={scene.providerName} />
                    <Field
                      label="Collection"
                      value={`${scene.collectionName} (${scene.collectionId})`}
                    />
                    <Field
                      label="Image ID"
                      value={scene.itemId}
                      mono
                      breakAll
                    />
                    <Field
                      label="Captured (UTC date and time)"
                      value={scene.acquiredAt}
                      mono
                    />
                    <Field
                      label="Published"
                      value={scene.publishedAt ?? "not reported"}
                      mono
                    />
                    <Field
                      label="Record updated"
                      value={scene.updatedAt ?? "not reported"}
                      mono
                    />
                    <Field label="Satellite" value={platformLabel(scene.platform)} />
                    <Field label="Orbit" value={scene.orbitState ?? "not reported"} />
                    <Field label="Map square" value={scene.gridCode ?? "not reported"} />
                    <Field
                      label="Pixel size"
                      value={formatResolution(scene.resolutionM)}
                    />
                    <Field
                      label="Cloud cover"
                      value={formatCloudCover(scene.cloudCoverPct)}
                    />
                    <Field
                      label="Image box"
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
                        label="Copernicus record"
                        value="Open image record"
                        href={scene.selfUrl}
                      />
                    )}
                  </dl>
                  <p className="mt-3 rounded-lg border border-edge/60 bg-abyss/50 px-3 py-2 text-[10px] leading-4 text-mist/70">
                    {scene.attribution}. The capture date comes from Copernicus and
                    is not guessed from the processing or upload date. The match
                    uses the UTC day of the satellite pass.
                  </p>
                </Panel>
              ) : (
                upload && (
                  <Panel>
                    <p className="eyebrow">Uploaded file data</p>
                    <dl className="mt-3">
                      <Field label="File name" value={upload.filename} breakAll />
                      <Field label="File type" value={upload.contentType} mono />
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
                        label="Entered UTC date"
                        value={upload.declaredCaptureDate}
                        mono
                      />
                      <Field
                        label="EXIF status"
                        value={upload.exifStatus}
                      />
                      <Field
                        label="EXIF capture time"
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
                        label="File fingerprint (SHA-256)"
                        value={upload.sha256 ?? "unavailable"}
                        mono
                        breakAll
                      />
                    </dl>
                    {upload.clientMetrics && (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <StatTile
                          label="mean brightness"
                          value={upload.clientMetrics.meanLuma.toFixed(1)}
                          hint="/ 255, rough number"
                        />
                        <StatTile
                          label="contrast"
                          value={upload.clientMetrics.stdDevLuma.toFixed(1)}
                          hint="luma std deviation"
                        />
                        <StatTile
                          label="focus"
                          value={upload.clientMetrics.laplacianVariance.toFixed(1)}
                          hint="Laplacian variance"
                        />
                      </div>
                    )}
                    <p className="mt-3 text-[10px] leading-4 text-mist/70">
These numbers were computed in your browser. They describe your file,
                      not a checked satellite product.
                    </p>
                  </Panel>
                )
              )}

              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">How this record was made</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">
                    real status at each step
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
                <p className="eyebrow">Map outline</p>
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
                    />                      <Field
                        label="Search box"
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
                        Copernicus files ({scene.assets.length})
                      </span>
                      <span className="font-mono text-[10px] text-mist">
                        login shown
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
                              {asset.requiresAuth ? "login needed" : "public"}
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
These links are shown for information only. The app does not download
                      image pixels. That needs a Copernicus login.
                    </p>
                  </details>
                </Panel>
              )}

              <Callout tone="info" icon={Info} title="What the labels mean">
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
              eyebrow="AI notes · not a measurement"
              title="AI commentary on the saved data"
              description="The model gets text only: no image pixels and no exact coordinates. It cannot change a check result or make a calculation."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-edge/60 bg-abyss/50 p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
service
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
status
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm",
                    aiInfo?.configured ? "text-emerald" : "text-warn",
                  )}
                >
                  {aiInfo
                    ? aiInfo.configured
                      ? "ready"
                      : "not set up"
                    : "checking…"}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-mist">
                  {aiInfo?.note ?? ""}
                </p>
              </div>
            </div>

            <details className="rounded-xl border border-edge/60 bg-abyss/40 p-4">
              <summary className="cursor-pointer text-xs text-ink">
Model details, output shape and failure behavior
              </summary>
              <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {[
                  [
                    "Model and version",
                    "gpt-4o-mini through the deployment AI gateway, adapter @vly-ai/integrations 0.6.14",
                  ],
                  [
                    "Job",
                    "Explain the saved image or upload data and its limits in plain language.",
                  ],
                  [
                    "Input",
                    "Text only: place label, dates, Copernicus IDs, pixel size, cloud cover and check results. No pixels or exact coordinates.",
                  ],
                  [
                    "Output shape",
                    "A summary, sections and a list of limits. The app checks this shape before saving.",
                  ],
                  [
                    "Known limits",
                    "The text can be wrong or incomplete. Copernicus tile numbers are not measurements of your target. The model can be unavailable.",
                  ],
                  [
                    "Evaluation",
                    "Only checks that the output has the right shape and avoids banned claims. No accuracy benchmark has been run.",
                  ],
                  [
                    "On failure",
                    "Bad output is rejected and nothing is saved. Old commentary is left as it was.",
                  ],
                  [
                    "Test results",
                    "The full flow has not been run with a live key in this session. The status above is the real availability.",
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
              <Callout tone="warn" title="AI is off in Settings" icon={ShieldAlert}>
                The fixed checks still run. Turn on AI commentary in{" "}
                <Link to="/workspace/settings" className="underline underline-offset-4">
                  Settings → AI and privacy
                </Link>{" "}
                if you want to call the model.
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
                {aiRunning ? "Model is running…" : "Run AI commentary"}
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
              <InlineSpinner label="Sending text and waiting for a reply…" />
            )}

            {record.analysis ? (
              <div className="space-y-4 rounded-xl border border-edge/70 bg-abyss/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
                    <BrainCircuit className="size-3" /> AI commentary
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
limits named by the model
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-4 text-mist">
                      {record.analysis.limitations.map((limitation, index) => (
                        <li key={index}>{limitation}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] leading-4 text-mist/60">
AI text is kept apart from checked facts and fixed calculations. A
                  confident answer is not a correct answer. No result in this
                  record depends on this text.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-edge/70 bg-abyss/30 p-6 text-center">
                <BrainCircuit className="mx-auto size-5 text-mist" />
                <p className="mt-2 text-sm text-ink">No AI commentary saved</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-mist">
                  AI is optional. The record is complete without it. The image data,
                  checks and any calculation stand on fixed evidence.
                </p>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="validation" className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="checks" value={summary.total} />
            <StatTile label="pass" value={summary.pass} />
            <StatTile label="warnings" value={summary.warn} />
            <StatTile label="fail" value={summary.fail} />
            <StatTile label="cannot measure" value={summary.notMeasurable} />
            <StatTile label="not checked" value={summary.notVerified} />
          </div>

          <Panel>
            <SectionHeading
              eyebrow="Every rule, every result"
              title="Check details"
              description="Each check comes from a fixed rule. The app records where the evidence came from. AI cannot add, remove or upgrade a check."
            />
            <div className="mt-4">
              <ValidationList checks={checks} />
            </div>
          </Panel>

          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Linked tank calculation"
              title="Full capacity from your inside sizes"
              description="The capacity comes from the sizes you entered. It is not measured from the image, and it is not inventory."
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
No calculation is attached. The record still stands as image data.
                No number was made up for it.
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
            title="What this record still cannot prove"
          >
            The maths is fixed and tested. The physical sizes, map position and
            any measurement from the image are not checked. The app never claims
            a tank size or liquid level from an image.
          </Callout>
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2 print-hide">
            <Button
              type="button"
              className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
              onClick={handleDownload}
            >
              <Download className="size-4" /> Download report (Markdown)
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
generated {report.generatedAt} · statuses kept as recorded
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
This report uses the saved statuses. It does not turn an estimate into
                    a fact and contains no accuracy score.
                  </p>
                </div>
              </>
            ) : (
              <InlineSpinner label="Building report…" />
            )}
          </div>

          <div className="print-hide grid gap-3 sm:grid-cols-3">
            <StatTile label="source" value={scene?.providerName ?? "upload"} />
            <StatTile
              label="attribution"
              value={
                <span className="text-xs leading-5">
                  {scene?.attribution ?? "Your image · no Copernicus data"}
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
Back to history
        </Link>
        <span className="text-mist/40">·</span>
        <Link
          to="/workspace"
          className="transition hover:text-ink"
        >
          Start another search
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
