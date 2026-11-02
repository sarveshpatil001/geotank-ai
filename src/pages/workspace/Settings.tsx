import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Callout,
  Field,
  InlineSpinner,
  Panel,
  SectionHeading,
  StatTile,
} from "@/components/workspace/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { downloadTextFile } from "@/lib/report";
import { cn } from "@/lib/utils";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  ShieldAlert,
  Trash2,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

type HealthResult = FunctionReturnType<typeof api.imagery.health>;
type AiStatus = FunctionReturnType<typeof api.aiStatus.status>;
type ExportPage = FunctionReturnType<typeof api.settings.exportData>;
type ExportProject = ExportPage["researchProjects"][number];
type ExportCalculation = ExportPage["calculations"][number];

const LIMITATIONS: { label: string; status: string; detail: string }[] = [
  {
    label: "Catalogue search",
    status: "VERIFIED",
    detail:
      "Anonymous CDSE STAC POST search was executed live during development and returned real Sentinel-2 L2A items. Empty, timeout, auth, rate-limit and upstream states are handled separately.",
  },
  {
    label: "Deterministic tank engine",
    status: "TESTED",
    detail:
      "40 deterministic engine checks cover reference volumes, unit invariance, non-finite inputs, range limits, rounding, catalogue normalisation, validation rules, EXIF parsing, URL safety and report sections. A separate 31-test Convex suite covers auth, limits, uploads, pagination, deletion and AI guards.",
  },
  {
    label: "Image upload pipeline",
    status: "IMPLEMENTED",
    detail:
      "The browser prepares a preview and heuristic quality statistics. The server re-reads the stored blob, verifies size, magic bytes, header dimensions, EXIF and SHA-256, then finalises it into a record. The server round-trip is verified live; the browser UI has not been visually exercised in this session.",
  },
  {
    label: "AI commentary",
    status: "IMPLEMENTED",
    detail:
      "The adapter is wired to the deployment's integration gateway and rejects unstructured or unsafe output (numeric measurements, affirmative liquid-level claims). Availability is a query; runs have per-user limits and a 60 s per-project cooldown. Output is never authoritative.",
  },
  {
    label: "Research report",
    status: "IMPLEMENTED",
    detail:
      "Generated deterministically from stored records. Section completeness is covered by the test script; the browser print layout has not been independently verified.",
  },
  {
    label: "Partial-fill volume",
    status: "NOT IMPLEMENTED",
    detail:
      "Deliberately out of scope until the segment geometry, liquid-level reference and reference values are validated.",
  },
  {
    label: "Image-derived tank dimensions",
    status: "NOT MEASURABLE",
    detail:
      "10 m Sentinel-2 pixels cannot resolve individual small-tank geometry to engineering tolerance, and no ground control points are measured.",
  },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const convex = useConvex();
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);
  const deleteAll = useMutation(api.settings.deleteAll);
  const activity = useQuery(api.audit.recent, { limit: 12 });
  const checkHealth = useAction(api.imagery.health);

  const [aiEnabledBusy, setAiEnabledBusy] = useState(false);
  const aiInfo: AiStatus | undefined = useQuery(api.aiStatus.status);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<Id<"deletionJobs"> | null>(
    null,
  );
  const deletionJob = useQuery(
    api.settings.deletionStatus,
    deleteJobId ? { jobId: deleteJobId } : "skip",
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const handleAiToggle = async (value: boolean) => {
    setAiEnabledBusy(true);
    setSettingsError(null);
    try {
      await updateSettings({ aiEnabled: value });
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : "The setting was not saved.",
      );
    } finally {
      setAiEnabledBusy(false);
    }
  };

  const handleHealth = async () => {
    setHealthBusy(true);
    setHealthError(null);
    try {
      setHealth(await checkHealth({}));
    } catch (error) {
      setHealthError(
        error instanceof Error
          ? error.message
          : "The connectivity check did not complete.",
      );
    } finally {
      setHealthBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      let firstPage: ExportPage | null = null;
      let pages = 0;
      const projectRows: ExportProject[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page: ExportPage = await convex.query(api.settings.exportData, {
          table: "projects",
          limit: 100,
          cursor,
        });
        firstPage ??= page;
        projectRows.push(...page.researchProjects);
        cursor = page.cursor;
        done = page.isDone;
        pages += 1;
        if (pages >= 1_000) {
          throw new Error(
            "The export exceeded 1,000 pages and was not truncated silently.",
          );
        }
      }

      const calculationRows: ExportCalculation[] = [];
      cursor = null;
      done = false;
      while (!done) {
        const page: ExportPage = await convex.query(api.settings.exportData, {
          table: "calculations",
          limit: 100,
          cursor,
        });
        firstPage ??= page;
        calculationRows.push(...page.calculations);
        cursor = page.cursor;
        done = page.isDone;
        pages += 1;
        if (pages >= 1_000) {
          throw new Error(
            "The export exceeded 1,000 pages and was not truncated silently.",
          );
        }
      }

      if (!firstPage) throw new Error("No signed-in account data was returned.");
      downloadTextFile(
        `tank-calculator-ai-export-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(
          {
            exportedAt: firstPage.exportedAt,
            account: firstPage.account,
            settings: firstPage.settings,
            researchProjects: projectRows,
            calculations: calculationRows,
            note: firstPage.note,
          },
          null,
          2,
        ),
        "application/json",
      );
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The export did not complete.",
      );
    } finally {
      setExporting(false);
    }
  };

  const deletionFinished = deletionJob?.status === "complete";
  const deletionBusy = deleting && !deletionFinished;
  const deletionMessage =
    deletionJob?.status === "complete"
      ? `Deleted ${deletionJob.projectsDeleted} research record(s), ${deletionJob.imagesDeleted} stored image(s), ${deletionJob.calculationsDeleted} calculation(s) and ${deletionJob.auditLogsDeleted} activity entr${deletionJob.auditLogsDeleted === 1 ? "y" : "ies"}.`
      : null;

  const handleDeleteAll = async () => {
    setDeleting(true);
    setDeleteError(null);
    setDeleteJobId(null);
    try {
      const result = await deleteAll({});
      setDeleteJobId(result.jobId);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "The deletion did not complete.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Settings & privacy</p>
        <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          Account, data and system status
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
          Every indicator on this page reflects a real query, a real stored
          setting or a live request. Nothing here is a decorative health badge.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-4">
          <SectionHeading eyebrow="Account" title="Signed-in session" />
          <dl>
            <Field label="Email" value={user?.email ?? "Not provided"} />
            <Field label="Display name" value={user?.name ?? "Not provided"} />
            <Field
              label="Account id"
              value={user?._id ? `${user._id.slice(0, 12)}…` : "unavailable"}
              mono
            />
            <Field
              label="Authentication"
              value={
                user?.isAnonymous
                  ? "Anonymous guest session"
                  : "Email one-time passcode"
              }
            />
          </dl>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-edge bg-transparent text-ink"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
          <p className="text-[11px] leading-5 text-mist">
            Research records and uploads are scoped to this account. Queries and
            mutations verify ownership on the server; the UI is not the access
            control.
          </p>
        </Panel>

        <Panel className="space-y-4">
          <SectionHeading
            eyebrow="AI & privacy"
            title="Model commentary consent"
            description="AI is optional. It never receives image pixels, exact coordinates or credentials."
          />
          <div className="flex items-start justify-between gap-4 rounded-xl border border-edge/60 bg-abyss/50 p-4">
            <div>
              <Label htmlFor="ai-toggle" className="text-sm text-ink">
                Allow AI commentary
              </Label>
              <p className="mt-1.5 text-[11px] leading-5 text-mist">
                When enabled, pressing “Run AI interpretation” sends the
                record&apos;s metadata text (location label, dates, provider
                identifiers, validation statuses) to the deployment&apos;s AI
                gateway. It does not send the image or exact coordinates.
              </p>
            </div>
            <Switch
              id="ai-toggle"
              checked={settings?.aiEnabled ?? true}
              onCheckedChange={(value) => void handleAiToggle(value)}
              disabled={aiEnabledBusy || settings === undefined}
              className="mt-0.5 data-[state=checked]:bg-emerald"
            />
          </div>
          {settingsError && <p className="text-xs text-danger">{settingsError}</p>}

          <div className="rounded-xl border border-edge/60 bg-abyss/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-ink">
                <BrainCircuit className="size-4 text-mint" /> Adapter
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.1em]",
                  aiInfo?.configured ? "text-emerald" : "text-warn",
                )}
              >
                {aiInfo
                  ? aiInfo.configured
                    ? "configured"
                    : "not configured"
                  : "checking"}
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-4 text-mist">
              {aiInfo?.adapter ?? "—"}
              <br />
              model · {aiInfo?.model ?? "unknown"}
            </p>
            <p className="mt-2 text-[11px] leading-4 text-mist">
              {aiInfo?.note ?? "Reading adapter status…"}
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="space-y-4">
        <SectionHeading
          eyebrow="Live checks"
          title="System status"
          description="This button performs a real network request. A failure is displayed as a failure."
          actions={
            <Button
              type="button"
              onClick={() => void handleHealth()}
              disabled={healthBusy}
              className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
            >
              {healthBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wifi className="size-4" />
              )}
              Check catalogue
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="catalogue endpoint"
            value={
              health
                ? health.reachable
                  ? "reachable"
                  : "unreachable"
                : "not checked"
            }
            hint="stac.dataspace.copernicus.eu"
            emphasis={Boolean(health?.reachable)}
          />
          <StatTile label="HTTP status" value={health?.httpStatus ?? "—"} hint="last check" />
          <StatTile
            label="latency"
            value={health ? `${health.latencyMs} ms` : "—"}
            hint="client-measured round trip"
          />
          <StatTile
            label="last checked"
            value={
              health ? new Date(health.checkedAt).toISOString().slice(11, 19) : "—"
            }
            hint="UTC"
          />
        </div>
        {health && !health.reachable && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
            {health.error ??
              `The catalogue answered HTTP ${health.httpStatus}. It is not currently usable for searches.`}
          </p>
        )}
        {healthError && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
            {healthError}
          </p>
        )}
        <p className="text-[11px] leading-5 text-mist">
          A reachable catalogue is necessary but not sufficient for a useful
          result: imagery does not exist for every place on every date.
        </p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-4">
          <SectionHeading
            eyebrow="Your data"
            title="Export and deletion"
            description="Deletion removes records, stored images and saved calculations for this account."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-edge bg-transparent text-ink"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-danger/30 bg-transparent text-danger hover:bg-danger/10"
              onClick={() => {
                setConfirmDelete(true);
                setDeleteJobId(null);
                setDeleting(false);
              }}
            >
              <Trash2 className="size-4" /> Delete all data
            </Button>
          </div>
          {exportError && <p className="text-xs text-danger">{exportError}</p>}
          {deletionMessage && (
            <p className="rounded-lg border border-emerald/30 bg-emerald/[0.06] px-3 py-2 text-xs leading-5 text-mint">
              {deletionMessage}
            </p>
          )}
          {deletionJob?.status === "running" && (
            <p className="rounded-lg border border-warn/30 bg-warn/[0.05] px-3 py-2 text-xs leading-5 text-warn">
              Deletion in progress: {deletionJob.projectsDeleted} record(s),{" "}
              {deletionJob.calculationsDeleted} calculation(s) and{" "}
              {deletionJob.imagesDeleted} image(s) removed so far. The counts
              only include committed deletions.
            </p>
          )}
          {confirmDelete && !deletionFinished && (
            <div className="rounded-xl border border-danger/40 bg-danger/[0.05] p-4">
              <p className="text-sm font-medium text-ink">
                Permanently delete everything for this account?
              </p>
              <p className="mt-1 text-[11px] leading-5 text-mist">
                This includes every research record, uploaded image, calculation,
                setting and activity entry. It cannot be undone.
              </p>
              {deleteError && <p className="mt-2 text-xs text-danger">{deleteError}</p>}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-mist"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deletionBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-danger text-[#1a0507] hover:bg-danger/90"
                  onClick={() => void handleDeleteAll()}
                  disabled={deletionBusy}
                >
                  {deletionBusy && <Loader2 className="size-4 animate-spin" />}
                  Delete everything
                </Button>
              </div>
            </div>
          )}
          <Callout tone="info" icon={KeyRound} title="Credentials">
            The AI integration key and any optional catalogue token are read from
            server-side environment variables. No credential is bundled into the
            browser code, and none is written to a research record.
          </Callout>
        </Panel>

        <Panel className="space-y-3">
          <SectionHeading
            eyebrow="Audit"
            title="Recent activity"
            description="Actions recorded for this account. Query text and image pixels are not logged."
          />
          {activity === undefined ? (
            <InlineSpinner label="Loading activity…" />
          ) : activity.length === 0 ? (
            <p className="text-xs leading-5 text-mist">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((entry) => (
                <li
                  key={entry._id}
                  className="rounded-lg border border-edge/50 bg-abyss/40 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
                      {entry.action}
                    </span>
                    <span className="font-mono text-[10px] text-mist/60">
                      {new Date(entry.at).toISOString().slice(5, 16).replace("T", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-mist">{entry.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="space-y-4">
        <SectionHeading
          eyebrow="Engineering honesty"
          title="Verification ledger and known limitations"
          description="Statuses describe evidence collected during development, not marketing readiness."
        />
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {LIMITATIONS.map((item) => (
            <li
              key={item.label}
              className="rounded-xl border border-edge/60 bg-abyss/40 p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{item.label}</p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]",
                    item.status === "VERIFIED" || item.status === "TESTED"
                      ? "border-emerald/40 bg-emerald/10 text-emerald"
                      : item.status === "NOT MEASURABLE" ||
                          item.status === "NOT IMPLEMENTED"
                        ? "border-warn/30 bg-warn/[0.05] text-warn"
                        : "border-edge bg-deepgreen/50 text-mist",
                  )}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-mist">{item.detail}</p>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-edge/60 bg-abyss/40 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
              <Database className="size-3.5" /> storage
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-mist">
              Convex database and protected file storage in this deployment.
              Uploads are deleted with their record.
            </p>
          </div>
          <div className="rounded-xl border border-edge/60 bg-abyss/40 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
              <Activity className="size-3.5" /> cost
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-mist">
              Catalogue metadata and Sentinel data are free and open. Geocoding
              uses the public Nominatim service at low volume with caching. AI
              calls bill to the deployment&apos;s integration account.
            </p>
          </div>
          <div className="rounded-xl border border-edge/60 bg-abyss/40 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
              <ShieldAlert className="size-3.5" /> scope
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-mist">
              Public educational research only. Not facility surveillance, not
              stock monitoring, and never a claim of measured inventory.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-edge/50 pt-3 text-[11px] text-mist">
          <CheckCircle2 className="size-3.5 text-emerald" />
          Mathematical correctness before AI confidence.
          <span className="text-mist/40">·</span>
          <AlertTriangle className="size-3.5 text-warn" />
          Unverified features are labelled above, not hidden.
        </div>
      </Panel>
    </div>
  );
}
