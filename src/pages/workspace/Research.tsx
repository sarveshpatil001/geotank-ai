import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePreview } from "@/components/workspace/ImagePreview";
import {
  Callout,
  EmptyState,
  InlineSpinner,
  Panel,
  SectionHeading,
  StatTile,
  StatusPill,
} from "@/components/workspace/primitives";
import {
  datePartOf,
  formatCloudCover,
  formatCoordinate,
  formatResolution,
  platformLabel,
  validateCaptureDate,
} from "@/lib/catalogue";
import { extractExif } from "@/lib/exif";
import {
  analyzeImageQuality,
  checkImageSignature,
  formatBytes,
  sha256Hex,
  type ImageQualityReport,
} from "@/lib/image-quality";
import { UPLOAD_LIMITS } from "@/lib/scientific-validation";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Cloud,
  ExternalLink,
  ImageUp,
  Info,
  Loader2,
  MapPin,
  Radar,
  Search,
  Satellite,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

type SearchResponse = FunctionReturnType<typeof api.imagery.search>;
type GeocodeResponse = FunctionReturnType<typeof api.geocoding.resolveLocation>;
type LocationCandidate = Extract<GeocodeResponse, { status: "ok" }>["candidates"][number];
type SearchSuccess = Extract<SearchResponse, { status: "ok" | "empty" }>;

const todayIso = new Date().toISOString().slice(0, 10);

type PreparedUpload = {
  file: File;
  previewUrl: string;
  detectedType: string;
  quality: ImageQualityReport;
  exif: Awaited<ReturnType<typeof extractExif>>;
  sha256: string | null;
};

export default function ResearchPage() {
  const navigate = useNavigate();
  const resolveLocation = useAction(api.geocoding.resolveLocation);
  const searchImagery = useAction(api.imagery.search);
  const createFromScene = useAction(api.projects.createFromScene);
  const finalizeUpload = useAction(api.upload.finalizeUpload);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const registerUpload = useMutation(api.files.registerUpload);

  const [locationQuery, setLocationQuery] = useState("");
  const [candidates, setCandidates] = useState<LocationCandidate[] | null>(null);
  const [selected, setSelected] = useState<LocationCandidate | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locateNote, setLocateNote] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxCloud, setMaxCloud] = useState("");

  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (prepared) URL.revokeObjectURL(prepared.previewUrl);
    };
  }, [prepared]);


  const handleLocate = async () => {
    setLocateError(null);
    setLocateNote(null);
    setCandidates(null);
    setSelected(null);
    setSearchResult(null);
    const validationError = locationQuery.trim().length < 2
      ? "Enter a place name or coordinates."
      : null;
    if (validationError) {
      setLocateError(validationError);
      return;
    }
    setLocating(true);
    try {
      const result = await resolveLocation({ query: locationQuery });
      if (result.status === "ok") {
        setCandidates(result.candidates);
        if (result.candidates.length === 1) {
          setSelected(result.candidates[0]);
        } else {
          setLocateNote(
            `${result.candidates.length} places matched. Choose the one you intend to research — no candidate is selected for you.`,
          );
        }
      } else if (result.status === "empty" || result.status === "invalid") {
        setLocateError(result.message);
      } else {
        setLocateError(result.message);
      }
    } catch (error) {
      setLocateError(
        error instanceof Error
          ? error.message
          : "The location could not be resolved.",
      );
    } finally {
      setLocating(false);
    }
  };

  const parsedCloud = useMemo(() => {
    if (maxCloud.trim() === "") return null;
    const value = Number(maxCloud);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : NaN;
  }, [maxCloud]);

  const handleSearch = async (windowDays?: number) => {
    setSearchError(null);
    setCreateError(null);
    if (!selected) {
      setSearchError("Resolve and select a search area first.");
      return;
    }
    const dateResult = validateCaptureDate(date);
    if (!dateResult.ok) {
      setSearchError(dateResult.message);
      return;
    }
    if (parsedCloud !== null && Number.isNaN(parsedCloud)) {
      setSearchError("Maximum cloud cover must be between 0 and 100.");
      return;
    }
    setSearching(true);
    try {
      const result = await searchImagery({
        bbox: selected.bbox,
        date: dateResult.date,
        maxCloudPct: parsedCloud ?? undefined,
        windowDays,
      });
      setSearchResult(result);
      if (result.status === "invalid") {
        setSearchError(result.message);
      } else if (result.status === "error") {
        setSearchError(result.detail);
      }
    } catch (error) {
      setSearchResult(null);
      setSearchError(
        error instanceof Error
          ? error.message
          : "The catalogue search did not complete.",
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSelectScene = async (
    scene: SearchSuccess["scenes"][number],
    result: SearchSuccess,
  ) => {
    if (!selected) return;
    const areaMatches = result.query.bbox.every(
      (value, index) => Math.abs(Number(value) - selected.bbox[index]) < 1e-9,
    );
    const dateMatches = result.requestedDate === date;
    const cloudMatches =
      (result.query.maxCloudPct ?? null) === (parsedCloud ?? null);
    if (!areaMatches || !dateMatches || !cloudMatches) {
      setCreateError(
        "The area, capture date or filter changed after this search. Run the search again so the stored record matches the provider query exactly.",
      );
      return;
    }
    setCreatingItem(scene.itemId);
    setCreateError(null);
    try {
      const created = await createFromScene({
        itemId: scene.itemId,
        collectionId: scene.collectionId,
        location: selected,
        requestedDate: result.requestedDate,
      });
      navigate(`/workspace/project/${created.id}`);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "The research record could not be created.",
      );
    } finally {
      setCreatingItem(null);
    }
  };

  const resetPrepared = () => {
    setPrepared((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    resetPrepared();
    if (
      !UPLOAD_LIMITS.allowedTypes.includes(
        file.type as (typeof UPLOAD_LIMITS.allowedTypes)[number],
      )
    ) {
      setUploadError("Only JPEG, PNG and WebP images are accepted.");
      return;
    }
    if (file.size > UPLOAD_LIMITS.maxBytes) {
      setUploadError(
        `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(UPLOAD_LIMITS.maxBytes)}.`,
      );
      return;
    }
    setUploadStage("Validating file signature and decoding image…");
    const signature = await checkImageSignature(file, file.type);
    if (!signature.matchesDeclared || !signature.detected) {
      setUploadStage(null);
      setUploadError(
        "The file signature does not match a supported image format. The file was not uploaded.",
      );
      return;
    }
    const quality = await analyzeImageQuality(file);
    if (!quality.ok) {
      setUploadStage(null);
      setUploadError(quality.message);
      return;
    }
    setUploadStage("Reading embedded metadata…");
    const [exif, digest] = await Promise.all([extractExif(file), sha256Hex(file)]);
    setPrepared({
      file,
      previewUrl: URL.createObjectURL(file),
      detectedType: signature.detected,
      quality: quality.report,
      exif,
      sha256: digest,
    });
    setUploadStage(null);
  };

  const handleUpload = async () => {
    setUploadError(null);
    if (!prepared) {
      setUploadError("Choose an image first.");
      return;
    }
    const dateResult = validateCaptureDate(date);
    if (!dateResult.ok) {
      setUploadError(
        `${dateResult.message} The declared capture date is required for an upload.`,
      );
      return;
    }
    setUploading(true);
    try {
      setUploadStage("Requesting a short-lived upload URL…");
      const uploadUrl = await generateUploadUrl();
      setUploadStage("Uploading the image to protected storage…");
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": prepared.detectedType },
        body: prepared.file,
      });
      if (!response.ok) {
        throw new Error(`Storage rejected the upload (HTTP ${response.status}).`);
      }
      const body = (await response.json()) as { storageId?: string };
      if (!body.storageId) {
        throw new Error("Storage did not return a file identifier.");
      }
      setUploadStage("Registering the upload with the server…");
      const pending = await registerUpload({
        storageId: body.storageId,
        filename: prepared.file.name,
        contentType: prepared.detectedType,
      });
      setUploadStage(
        "Server is re-reading the file, dimensions, metadata and checksum…",
      );
      const created = await finalizeUpload({
        uploadId: pending.uploadId,
        location: selected,
        requestedDate: dateResult.date,
      });
      navigate(`/workspace/project/${created.id}`);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "The upload did not complete.",
      );
      setUploadStage(null);
    } finally {
      setUploading(false);
    }
  };

  const successfulSearch: SearchSuccess | null =
    searchResult && (searchResult.status === "ok" || searchResult.status === "empty")
      ? searchResult
      : null;
  const failedSearch =
    searchResult && (searchResult.status === "invalid" || searchResult.status === "error")
      ? searchResult
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Step 1 — 2 · Imagery request</p>
          <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            New imagery research
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
            Two required inputs: a location and the date the image was acquired.
            Everything else is optional and explained before it is used.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-edge/70 bg-abyss/60 px-3 py-2">
          <Satellite className="size-4 text-emerald" />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
            Sentinel-2 L2A · CDSE STAC
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="space-y-6">
          <div>
            <Label htmlFor="location" className="mb-2 text-xs text-mist">
              Location <span className="text-emerald">required</span>
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" />
                <Input
                  id="location"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleLocate();
                    }
                  }}
                  placeholder="Place name or 51.95, 4.14"
                  className="h-11 border-edge bg-abyss/70 pl-9 text-ink placeholder:text-mist/50"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-11 gap-2 bg-deepgreen text-ink hover:bg-deepgreen/80"
                onClick={() => void handleLocate()}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Resolve area
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-mist/80">
              Coordinates are parsed locally. Place names use OpenStreetMap
              Nominatim, and you choose the matching candidate. The search area is
              capped at 0.6°; it is never silently expanded.
            </p>

            {locateError && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {locateError}
              </p>
            )}
            {locateNote && (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs leading-5 text-warn">
                {locateNote}
              </p>
            )}

            {candidates && candidates.length > 1 && (
              <ul className="mt-3 space-y-2">
                {candidates.map((candidate, index) => {
                  const isSelected =
                    selected?.lat === candidate.lat &&
                    selected?.lon === candidate.lon;
                  return (
                    <li key={`${candidate.label}-${index}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(candidate);
                          setSearchResult(null);
                          setSearchError(null);
                          setCreateError(null);
                        }}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                          isSelected
                            ? "border-emerald/50 bg-emerald/[0.07]"
                            : "border-edge/70 bg-abyss/50 hover:border-emerald/30",
                        )}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="text-xs leading-5 text-ink">
                            {candidate.label}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />
                          )}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] text-mist">
                          {formatCoordinate(candidate.lat, candidate.lon)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected && (
              <div className="mt-4 rounded-xl border border-emerald/25 bg-emerald/[0.04] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow text-emerald">resolved search area</p>
                  <span className="font-mono text-[10px] text-mist">
                    {selected.source}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-5 text-ink">{selected.label}</p>
                <p className="mt-1 font-mono text-[11px] text-mint">
                  {formatCoordinate(selected.lat, selected.lon)}
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-mist">
                  bbox {selected.bbox.map((value) => value.toFixed(4)).join(", ")}
                </p>
                {selected.clamped && (
                  <p className="mt-2 text-[11px] leading-4 text-warn">
                    The provider footprint was larger than the supported search
                    span, so the box was capped around its centre.
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-4 text-mist/70">
                  {selected.attribution}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-edge/60 pt-5">
            <Label htmlFor="capture-date" className="mb-2 text-xs text-mist">
              Image capture date <span className="text-emerald">required</span>
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" />
              <Input
                id="capture-date"
                type="date"
                value={date}
                max={todayIso}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSearchResult(null);
                  setSearchError(null);
                  setCreateError(null);
                }}
                className="h-11 border-edge bg-abyss/70 pl-9 text-ink [color-scheme:dark]"
              />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-mist/80">
              This is the acquisition date, not the processing or ingestion date.
              A future date is rejected; an exact date with no imagery is reported
              as empty rather than replaced.
            </p>

            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="mt-4 flex w-full items-center justify-between rounded-lg border border-edge/60 bg-abyss/40 px-3 py-2 text-left text-xs text-mist transition hover:text-ink"
            >
              <span className="flex items-center gap-2">
                <Cloud className="size-3.5" />
                Optional filters
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
            {advancedOpen && (
              <div className="mt-3 space-y-2 rounded-lg border border-edge/60 bg-abyss/40 p-3">
                <Label htmlFor="max-cloud" className="text-xs text-mist">
                  Maximum provider cloud cover (%)
                </Label>
                <Input
                  id="max-cloud"
                  inputMode="numeric"
                  placeholder="Leave empty to include every cloud level"
                  value={maxCloud}
                  onChange={(event) => {
                    setMaxCloud(event.target.value);
                    setSearchResult(null);
                    setSearchError(null);
                    setCreateError(null);
                  }}
                  className="h-10 border-edge bg-navy/70 text-ink placeholder:text-mist/50"
                />
                <p className="text-[11px] leading-4 text-mist/70">
                  Applied by the catalogue query. Excluded scenes are counted and
                  reported, never hidden.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-edge/60 pt-5 sm:flex-row">
            <Button
              type="button"
              className="h-12 flex-1 gap-2 bg-emerald font-semibold text-[#04130f] hover:bg-emerald/90"
              onClick={() => void handleSearch()}
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radar className="size-4" />
              )}
              {searching ? "Searching catalogue…" : "Search imagery"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 gap-2 border-edge bg-transparent text-ink hover:bg-deepgreen/40"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <ImageUp className="size-4" />
              Upload image (optional)
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOAD_LIMITS.allowedTypes.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="space-y-4">
            <p className="eyebrow">Request summary</p>
            <dl className="space-y-3">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  location
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {selected ? selected.label : "Not resolved"}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  capture date
                </dt>
                <dd className="mt-1 font-mono text-sm text-ink">
                  {date || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                  provider
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  Copernicus Data Space Ecosystem
                </dd>
                <dd className="mt-1 text-[11px] leading-4 text-mist">
                  STAC API v1, anonymous read-only metadata search. Pixel
                  downloads require a Copernicus account and are not requested.
                </dd>
              </div>
            </dl>
            <a
              href="https://documentation.dataspace.copernicus.eu/APIs/STAC.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-mint underline decoration-mint/30 underline-offset-4 hover:decoration-mint"
            >
              <ExternalLink className="size-3" />
              CDSE STAC documentation
            </a>
          </Panel>

          <Callout
            tone="info"
            icon={ShieldAlert}
            title="What this workflow will never claim"
          >
            A satellite image cannot reveal a tank&apos;s internal liquid level or
            inventory. Sentinel-2 at 10 m is far too coarse for individual
            small-tank geometry. Every record carries these limits explicitly.
          </Callout>

          <Panel flat className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Info className="size-3.5 text-emerald" />
              <p className="eyebrow">Data handling</p>
            </div>
            <p className="text-[11px] leading-5 text-mist">
              Images are stored in this deployment&apos;s protected Convex file
              storage, only accessible through your signed-in records. AI
              commentary, if used, receives metadata text — never image pixels or
              exact coordinates.
            </p>
          </Panel>
        </div>
      </div>

      {searchError && !failedSearch && (
        <Callout tone="danger" title="Search not started" icon={AlertTriangle}>
          {searchError}
        </Callout>
      )}

      {prepared && (
        <Panel className="space-y-4">
          <SectionHeading
            eyebrow="Optional upload · step 4"
            title="Uploaded image is not an authenticated satellite product"
            description="The file has been decoded locally. Its provenance, ground scale and capture date remain unverified until you review the validation panel."
          />
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <img
              src={prepared.previewUrl}
              alt={`Preview of ${prepared.file.name}`}
              className="aspect-square w-full rounded-xl border border-edge/80 object-cover"
            />
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="file"
                  value={
                    <span className="break-all text-sm">{prepared.file.name}</span>
                  }
                  hint={`${formatBytes(prepared.file.size)} · ${prepared.detectedType}`}
                />
                <StatTile
                  label="dimensions"
                  value={`${prepared.quality.width} × ${prepared.quality.height}`}
                  hint="decoded by the browser"
                />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                    exif
                  </dt>
                  <dd className="mt-0.5 text-ink">{prepared.exif.status}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                    embedded capture date
                  </dt>
                  <dd className="mt-0.5 font-mono text-ink">
                    {prepared.exif.dateTimeOriginal ?? "not present"}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                    gps in exif
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {prepared.exif.gps ? "present (not used for search)" : "absent"}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                    sha-256
                  </dt>
                  <dd className="mt-0.5 break-all font-mono text-[10px] text-ink">
                    {prepared.sha256?.slice(0, 24) ?? "unavailable"}…
                  </dd>
                </div>
              </dl>
              <p className="text-[11px] leading-5 text-mist">
                EXIF is editable metadata. It corroborates — never proves — the
                declared capture date. Declared date:{" "}
                <span className="font-mono text-mint">{date || "not set"}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={uploading || !date}
                  className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Store and validate upload
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetPrepared}
                  disabled={uploading}
                  className="text-mist hover:text-ink"
                >
                  Remove file
                </Button>
              </div>
              {!date && (
                <p className="text-[11px] text-warn">
                  Set the capture date above before storing the upload.
                </p>
              )}
            </div>
          </div>
          {uploadStage && <InlineSpinner label={uploadStage} />}
          {uploadError && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
              {uploadError}
            </p>
          )}
        </Panel>
      )}

      {uploadError && !prepared && (
        <Callout tone="danger" title="Upload rejected" icon={AlertTriangle}>
          {uploadError}
        </Callout>
      )}

      {searching && (
        <Panel className="flex items-center gap-3">
          <Loader2 className="size-4 animate-spin text-emerald" />
          <div>
            <p className="text-sm text-ink">
              Querying the Copernicus catalogue for{" "}
              <span className="font-mono text-emerald">{date}</span>
            </p>
            <p className="text-[11px] text-mist">
              This is a live request. No cached or demonstration results are shown.
            </p>
          </div>
        </Panel>
      )}

      {failedSearch && (
        <Panel className="border-danger/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 text-danger" />
            <div>
              <p className="font-display text-sm font-medium text-ink">
                {failedSearch.status === "error"
                  ? failedSearch.title
                  : "Search input rejected"}
              </p>
              <p className="mt-1 text-xs leading-5 text-mist">
                {failedSearch.status === "error"
                  ? failedSearch.detail
                  : failedSearch.message}
              </p>
              {failedSearch.status === "error" && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-danger/80">
                  failure kind · {failedSearch.kind}
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}

      {successfulSearch && (
        <section className="space-y-4">
          <SectionHeading
            eyebrow="Step 3 · Catalogue response"
            title={
              successfulSearch.status === "ok"
                ? `${successfulSearch.scenes.length} provider result${successfulSearch.scenes.length === 1 ? "" : "s"}`
                : "No imagery for this exact request"
            }
            description={successfulSearch.note}
            actions={
              successfulSearch.status === "ok" ? (
                <span className="rounded-full border border-emerald/30 bg-emerald/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald">
                  live provider data
                </span>
              ) : undefined
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="provider features"
              value={successfulSearch.counts.returnedFeatures}
              hint="returned by CDSE"
            />
            <StatTile
              label="accepted"
              value={successfulSearch.counts.exactDateMatches}
              hint={successfulSearch.mode === "exact" ? "exact date" : "in window"}
              emphasis
            />
            <StatTile
              label="different dates"
              value={successfulSearch.counts.differentDateFeatures}
              hint="rejected, not substituted"
            />
            <StatTile
              label="other exclusions"
              value={
                successfulSearch.counts.filteredByCloud +
                successfulSearch.counts.malformedFeatures
              }
              hint="cloud filter + malformed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-edge/60 bg-abyss/40 px-3 py-2 font-mono text-[10px] text-mist">
            <span>query · {successfulSearch.collection.id}</span>
            <span>datetime · {successfulSearch.interval}</span>
            <span>
              bbox ·{" "}
              {successfulSearch.query.bbox
                .map((value) => Number(value).toFixed(4))
                .join(", ")}
            </span>
            {successfulSearch.query.maxCloudPct !== null && (
              <span>max cloud · {successfulSearch.query.maxCloudPct}%</span>
            )}
          </div>

          {successfulSearch.status === "empty" ? (
            <Panel className="space-y-4">
              <div className="flex items-start gap-3">
                <Satellite className="mt-0.5 size-5 text-warn" />
                <div>
                  <p className="font-display text-sm font-medium text-ink">
                    The catalogue answered successfully with zero matching scenes
                  </p>
                  <p className="mt-1 text-xs leading-5 text-mist">
                    This is an empty result, not a failure, and no imagery was
                    substituted. Sentinel-2 does not image every location every
                    day. You can deliberately widen the search to a nearby date
                    window; each result will show its actual acquisition date.
                  </p>
                </div>
              </div>
              {successfulSearch.mode === "exact" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-edge text-ink"
                    onClick={() => void handleSearch(3)}
                    disabled={searching}
                  >
                    Search ±3 days
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-edge text-ink"
                    onClick={() => void handleSearch(7)}
                    disabled={searching}
                  >
                    Search ±7 days
                  </Button>
                </div>
              )}
              {successfulSearch.mode === "window" && (
                <p className="text-[11px] text-mist">
                  The selected window was{" "}
                  {successfulSearch.window?.startDate} to{" "}
                  {successfulSearch.window?.endDate}. No result exists in that
                  window for this area.
                </p>
              )}
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {successfulSearch.scenes.map((scene) => {
                const acquiredDate = datePartOf(scene.acquiredAt);
                const differs = acquiredDate !== successfulSearch.requestedDate;
                const isCreating = creatingItem === scene.itemId;
                return (
                  <Panel key={scene.itemId} className="space-y-4">
                    <ImagePreview
                      src={scene.thumbnailUrl}
                      alt={`Provider quicklook for ${scene.itemId}`}
                      caption="Provider quicklook. Rendered preview for orientation only — not radiometric data."
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={differs ? "WARN" : "PASS"} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                        {differs ? "different acquisition date" : "exact date match"}
                      </span>
                    </div>
                    {differs && (
                      <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-4 text-warn">
                        Acquired {scene.acquiredAt}, not the requested{" "}
                        {successfulSearch.requestedDate}. Selecting it records a
                        window result and flags the difference.
                      </p>
                    )}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                          acquisition (UTC)
                        </dt>
                        <dd className="mt-1 font-mono text-[11px] leading-5 text-ink">
                          {scene.acquiredAt}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                          resolution
                        </dt>
                        <dd className="mt-1 text-xs text-ink">
                          {formatResolution(scene.resolutionM)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                          cloud cover
                        </dt>
                        <dd className="mt-1 text-xs text-ink">
                          {formatCloudCover(scene.cloudCoverPct)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
                          platform / orbit
                        </dt>
                        <dd className="mt-1 text-xs text-ink">
                          {platformLabel(scene.platform)}
                          {scene.orbitState ? ` · ${scene.orbitState}` : ""}
                        </dd>
                      </div>
                    </dl>
                    <p className="break-all font-mono text-[10px] leading-4 text-mist/70">
                      {scene.itemId}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
                        onClick={() =>
                          void handleSelectScene(scene, successfulSearch)
                        }
                        disabled={isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                        Use this scene
                      </Button>
                      <span className="font-mono text-[10px] text-mist/70">
                        {scene.gridCode ?? "no grid code"}
                      </span>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}

          {createError && (
            <Callout tone="danger" title="Record could not be created" icon={AlertTriangle}>
              {createError}
            </Callout>
          )}
        </section>
      )}

      {!searchResult && !searching && (
        <EmptyState
          icon={Radar}
          title="No catalogue query has run yet"
          description="Resolve a location, choose the capture date and press Search imagery. Results come straight from the Copernicus Data Space Ecosystem STAC API."
          action={
            <Button asChild variant="outline" className="border-edge text-ink">
              <Link to="/workspace/history" className="gap-2">
                View past records <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
