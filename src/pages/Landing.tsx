import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Layers,
  Lock,
  MapPin,
  Radar,
  Ruler,
  Satellite,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const TRUST = [
  {
    icon: Satellite,
    label: "Copernicus Sentinel-2 L2A",
    detail: "live CDSE STAC metadata",
  },
  { icon: Ruler, label: "10 m / pixel", detail: "provider-declared resolution" },
  { icon: Calculator, label: "tank-math/1.0.0", detail: "32 reference checks run" },
  { icon: BrainCircuit, label: "AI advisory only", detail: "no numerical authority" },
];

const METHOD = [
  {
    icon: MapPin,
    title: "Resolve the area",
    copy: "Coordinates are parsed locally; place names go through OpenStreetMap Nominatim. You choose the candidate, and the search box is capped instead of silently expanded.",
    meta: "WGS 84 · bbox ≤ 0.6°",
  },
  {
    icon: CalendarClock,
    title: "Fix the acquisition date",
    copy: "A real, non-future calendar date becomes a closed UTC day interval. Acquisition, processing and ingestion timestamps stay distinct in every record.",
    meta: "UTC 00:00:00 – 23:59:59",
  },
  {
    icon: Radar,
    title: "Query the catalogue",
    copy: "A read-only STAC request goes to the Copernicus Data Space Ecosystem. Empty results, timeouts, rate limits and server errors are reported as different states.",
    meta: "stac.dataspace.copernicus.eu/v1",
  },
  {
    icon: ShieldCheck,
    title: "Validate, calculate, report",
    copy: "Deterministic rules label every claim. The cylinder engine computes capacity from your internal dimensions; a report assembles the record without upgrading any status.",
    meta: "V = π r² H / V = π r² L",
  },
];

const LEDGER = [
  {
    label: "Catalogue search",
    status: "VERIFIED",
    copy: "Live anonymous CDSE search returned real Sentinel-2 items during development; failure states are distinguished from empty results.",
  },
  {
    label: "Deterministic tank engine",
    status: "TESTED",
    copy: "Reference volumes, unit invariance, non-finite inputs, invalid dimensions and presentation rounding are covered by the repository test script.",
  },
  {
    label: "Scientific validation",
    status: "TESTED",
    copy: "Cloud thresholds, date disagreement, upload provenance and the liquid-level rules are asserted in automated checks.",
  },
  {
    label: "Image uploads",
    status: "IMPLEMENTED",
    copy: "Signature, size, decode and EXIF checks run before upload; storage metadata is re-verified server-side. Browser round-trip not yet verified.",
  },
  {
    label: "AI commentary",
    status: "IMPLEMENTED",
    copy: "Metadata-only prompt, structured output validation and separate storage. Requires a runtime integration key; never authoritative.",
  },
  {
    label: "Research report",
    status: "IMPLEMENTED",
    copy: "Deterministic Markdown/PDF-ready report with statuses reproduced exactly as recorded. No accuracy percentage is ever invented.",
  },
];

const APP_AT = [
  "Research request with location and capture date",
  "Provider selection with real metadata and quicklook",
  "Image viewer, footprint diagram and asset inventory",
  "AI commentary kept separate from evidence",
  "Rule-by-rule validation ledger",
  "Deterministic tank calculator with unit handling",
  "Downloadable report and project history",
  "Privacy controls: export, deletion, audit trail",
];

export default function Landing() {
  return (
    <div className="relative min-h-screen bg-navy">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(1000px circle at 15% -5%, rgba(67,217,160,0.13), transparent 55%), radial-gradient(800px circle at 90% 10%, rgba(120,207,174,0.08), transparent 50%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 geo-grid opacity-[0.16]"
      />

      <header className="sticky top-0 z-40 border-b border-edge/60 bg-navy/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Sections">
            <a
              href="#method"
              className="text-xs text-mist transition hover:text-ink"
            >
              Method
            </a>
            <a
              href="#boundaries"
              className="text-xs text-mist transition hover:text-ink"
            >
              Boundaries
            </a>
            <a
              href="#ledger"
              className="text-xs text-mist transition hover:text-ink"
            >
              Status ledger
            </a>
            <a
              href="https://documentation.dataspace.copernicus.eu/APIs/STAC.html"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-mist transition hover:text-ink"
            >
              Provider docs <ExternalLink className="size-3" />
            </a>
          </nav>
          <Button
            asChild
            className="h-9 gap-2 bg-emerald text-xs font-semibold text-[#04130f] hover:bg-emerald/90"
          >
            <Link to="/auth?returnTo=/workspace">
              Open workspace <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-emerald/40 to-transparent" />
      </header>

      <main className="relative">
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:px-8 lg:pb-20 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-edge/80 bg-abyss/60 px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-emerald" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mint">
                Geospatial research workspace · v1
              </span>
            </div>

            <h1 className="mt-6 font-display text-[2.6rem] font-medium leading-[1.02] tracking-tight text-ink text-balance sm:text-6xl">
              Satellite evidence.
              <br />
              Deterministic maths.
              <br />
              <span className="text-emerald">Stated limits.</span>
            </h1>

            <p className="mt-6 max-w-xl text-sm leading-7 text-mist sm:text-base">
              Search real Copernicus Sentinel-2 acquisitions for a place and a
              capture date, record exactly what the provider returned, and compute
              ideal-cylinder capacity with a tested engine. Tank Calculator AI is
              built to preserve the distinction between what was observed, what
              was calculated and what remains unverifiable.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="h-12 gap-2 bg-emerald px-5 font-semibold text-[#04130f] hover:bg-emerald/90"
              >
                <Link to="/auth?returnTo=/workspace">
                  Start a research request <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 gap-2 border-edge bg-transparent px-5 text-ink hover:bg-deepgreen/40"
              >
                <Link to="/auth?returnTo=/workspace/calculator">
                  <Calculator className="size-4" /> Open the calculator
                </Link>
              </Button>
            </div>

            <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-mist/60">
              <Lock className="size-3" />
              free and open data sources · AI commentary optional
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative overflow-hidden p-5 glow-emerald sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Request → evidence</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-mist/60">
                workflow map
              </span>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-xl border border-edge/60 bg-[#06141c] p-4">
              <svg
                viewBox="0 0 320 180"
                className="absolute inset-x-0 top-0 h-40 w-full opacity-70"
                aria-hidden="true"
              >
                <defs>
                  <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#43D9A0" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#43D9A0" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="160" cy="88" r="78" fill="url(#hero-glow)" />
                <ellipse
                  cx="160"
                  cy="88"
                  rx="120"
                  ry="44"
                  fill="none"
                  stroke="#2f5d54"
                  strokeWidth="0.7"
                  strokeDasharray="2 5"
                  transform="rotate(-14 160 88)"
                />
                <ellipse
                  cx="160"
                  cy="88"
                  rx="86"
                  ry="32"
                  fill="none"
                  stroke="#43D9A0"
                  strokeOpacity="0.35"
                  strokeWidth="0.7"
                  transform="rotate(-14 160 88)"
                />
                <circle cx="260" cy="57" r="3" fill="#43D9A0" />
                <circle cx="60" cy="119" r="2" fill="#78CFAE" />
                <path
                  d="M160 46v20M160 110v20M160 88h-28M160 88h28"
                  stroke="#24443E"
                  strokeWidth="0.7"
                />
                <rect
                  x="148"
                  y="62"
                  width="24"
                  height="7"
                  fill="#43D9A0"
                  opacity="0.9"
                />
                <rect x="150" y="69" width="5" height="20" fill="#43D9A0" opacity="0.8" />
                <rect x="165" y="69" width="5" height="20" fill="#43D9A0" opacity="0.8" />
                <rect x="155" y="69" width="10" height="5" fill="#78CFAE" />
                <rect x="155" y="74" width="4" height="12" fill="#78CFAE" opacity="0.85" />
                <rect x="161" y="74" width="4" height="12" fill="#78CFAE" opacity="0.85" />
                <text x="6" y="14" fill="#91AAA5" fontSize="5" fontFamily="monospace">
                  WGS 84
                </text>
                <text x="264" y="174" fill="#91AAA5" fontSize="5" fontFamily="monospace">
                  10 m
                </text>
              </svg>

              <div className="relative flex min-h-[250px] flex-col justify-end">
                <ol className="space-y-2.5">
                  {[
                    ["01", "Resolve area", "place or coordinates"],
                    ["02", "Capture date", "closed UTC day"],
                    ["03", "Catalogue query", "CDSE STAC · read only"],
                    ["04", "Validate & report", "statuses stay attached"],
                  ].map(([index, title, meta]) => (
                    <li
                      key={index}
                      className="flex items-center gap-3 rounded-lg border border-edge/60 bg-navy/70 px-3 py-2 backdrop-blur-sm"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded border border-emerald/30 bg-emerald/10 font-mono text-[9px] text-emerald">
                        {index}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-ink">{title}</span>
                        <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-mist/70">
                          {meta}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-edge/50 pt-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-mist/60">
                provider · copernicus dataspace
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-mint">
                <ShieldCheck className="size-3" /> validation attached
              </span>
            </div>
          </motion.div>
        </section>

        <div className="border-y border-edge/50 bg-abyss/40">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px px-4 py-5 sm:px-6 lg:grid-cols-4 lg:px-8">
            {TRUST.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 px-1 py-2">
                <item.icon className="size-4 shrink-0 text-emerald" />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-ink">
                    {item.label}
                  </p>
                  <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-mist/60">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <motion.section
          id="method"
          {...fadeUp}
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
        >
          <div className="max-w-2xl">
            <p className="eyebrow">The method</p>
            <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
              Four steps, each with a verifiable record.
            </h2>
            <p className="mt-4 text-sm leading-7 text-mist">
              The workflow needs two inputs. Optional filters are labelled as
              optional, and every additional request explains what it is used for.
              Nothing is substituted behind your back.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METHOD.map((step, index) => (
              <div
                key={step.title}
                className="group relative rounded-xl border border-edge/70 bg-panel/50 p-5 transition-colors hover:border-emerald/35"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-lg border border-edge bg-deepgreen/50">
                    <step.icon className="size-4 text-emerald" />
                  </span>
                  <span className="font-mono text-[10px] text-mist/50">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-medium text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-5 text-mist">{step.copy}</p>
                <p className="mt-4 border-t border-edge/50 pt-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mint/80">
                  {step.meta}
                </p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="boundaries"
          {...fadeUp}
          className="relative scroll-mt-24 overflow-hidden border-y border-edge/60 bg-[#08201f]"
        >
          <div className="absolute inset-0 geo-rings opacity-60" aria-hidden="true" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-20">
            <div>
              <p className="eyebrow">Scientific boundaries</p>
              <h2 className="mt-3 max-w-lg font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                What this application refuses to say.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-mist">
                A visible tank roof is not a liquid level. A cylinder formula is
                not an inventory measurement. A 10 m pixel is not a survey. Those
                are hard rules in the code, not disclaimers added at the end.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  {
                    title: "Internal liquid level",
                    copy: "Optical imagery observes the outside of a tank. The app reports this check as NOT MEASURABLE and will not estimate a fill height.",
                  },
                  {
                    title: "Liquid inventory",
                    copy: "Inventory needs authorised measurements, calibration tables, temperature and product data. It is outside scope and never inferred from an image.",
                  },
                  {
                    title: "Small-tank geometry from Sentinel-2",
                    copy: "At 10 m per pixel, a 20–40 m tank spans two to four pixels. Individual geometry cannot be resolved to engineering tolerance.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-3 rounded-xl border border-warn/25 bg-warn/[0.04] p-4"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                    <div>
                      <p className="text-sm font-medium text-ink">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-mist">{item.copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel-flat p-5">
                <div className="flex items-center gap-2">
                  <Calculator className="size-4 text-emerald" />
                  <p className="eyebrow">Deterministic core</p>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="font-mono text-xs text-mint">V = π × r² × H</p>
                    <p className="mt-1 text-[11px] text-mist">
                      Vertical cylinder · internal radius and cylindrical height
                    </p>
                  </div>
                  <div className="border-t border-edge/50 pt-3">
                    <p className="font-mono text-xs text-mint">V = π × r² × L</p>
                    <p className="mt-1 text-[11px] text-mist">
                      Horizontal cylinder · full capacity only
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-edge/60 bg-navy/50 p-3">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald" />
                  <p className="text-[11px] leading-4 text-mist">
                    Units are explicit, inputs are range-checked, intermediate
                    values are never rounded and the saved record is recomputed
                    server-side.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-edge/60 bg-abyss/60 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-mist/70">
                    capacity
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink">
                    A geometric quantity, exact for the ideal cylinder.
                  </p>
                </div>
                <div className="rounded-xl border border-edge/60 bg-abyss/60 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-mist/70">
                    inventory
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink">
                    A physical measurement this tool does not perform.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          id="ledger"
          {...fadeUp}
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Status ledger</p>
              <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                Implemented, tested, verified — kept apart.
              </h2>
              <p className="mt-4 text-sm leading-7 text-mist">
                These statuses describe evidence collected during development.
                They are also visible inside the app, next to the limitations.
              </p>
            </div>
            <span className="rounded-full border border-edge bg-abyss/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
              v1 · single researcher
            </span>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {LEDGER.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-edge/70 bg-panel/50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{item.label}</p>
                  <span
                    className={
                      item.status === "VERIFIED" || item.status === "TESTED"
                        ? "rounded-full border border-emerald/40 bg-emerald/10 px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] text-emerald"
                        : "rounded-full border border-edge bg-deepgreen/50 px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] text-mist"
                    }
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-mist">{item.copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-5 rounded-2xl border border-edge/70 bg-panel/40 p-6 lg:grid-cols-[1fr_1.1fr] lg:p-8">
            <div>
              <p className="eyebrow">In the workspace</p>
              <h3 className="mt-2 font-display text-xl font-medium text-ink">
                Research that produces a record, not a dashboard of guesses.
              </h3>
              <p className="mt-3 text-xs leading-6 text-mist">
                Every screen is backed by stored data. Sample analysis results are
                not hardcoded into production screens; demonstration data, where it
                exists in the future, must be labelled DEMO.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  asChild
                  className="gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
                >
                  <Link to="/auth?returnTo=/workspace">
                    Enter the workspace <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="gap-2 border-edge bg-transparent text-ink"
                >
                  <a
                    href="https://dataspace.copernicus.eu/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Copernicus Data Space <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            </div>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {APP_AT.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald" />
                  <span className="text-[11px] leading-5 text-mist">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>

        <motion.section
          {...fadeUp}
          className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20"
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald/25 bg-[#0a2622] p-6 sm:p-10">
            <div className="absolute inset-0 geo-grid opacity-30" aria-hidden="true" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow">Start with two inputs</p>
                <h2 className="mt-2 font-display text-2xl font-medium leading-tight text-ink sm:text-3xl">
                  A place, a date, and an honest record of what exists.
                </h2>
                <p className="mt-3 text-sm leading-6 text-mist">
                  Location and capture date are all the imagery search requires.
                  The calculator stands alone when that is all you need.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  asChild
                  className="h-11 gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
                >
                  <Link to="/auth?returnTo=/workspace">Search imagery</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 gap-2 border-edge bg-transparent text-ink hover:bg-deepgreen/40"
                >
                  <Link to="/auth?returnTo=/workspace/calculator">
                    <Layers className="size-4" /> Tank calculator
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      <footer className="relative border-t border-edge/60 bg-abyss/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="max-w-md">
            <Brand />
            <p className="mt-3 text-[11px] leading-5 text-mist">
              Contains modified Copernicus Sentinel data where catalogue imagery is
              referenced. Sentinel data are provided under the Copernicus Sentinel
              Data Legal Notice. Geocoding © OpenStreetMap contributors (ODbL).
            </p>
          </div>
          <div className="grid gap-2 text-[11px] text-mist">
            <span className="flex items-center gap-1.5">
              <Satellite className="size-3.5 text-emerald" />
              Copernicus Data Space Ecosystem · STAC v1
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-emerald" />
              Convex records + protected file storage
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="size-3.5 text-emerald" />
              Reports reproduce recorded statuses, not optimistic summaries
            </span>
          </div>
          <p className="max-w-xs font-mono text-[9px] uppercase leading-5 tracking-[0.12em] text-mist/60">
            Public educational research only. Not facility surveillance, not
            stock monitoring, not a measurement of tank contents.
          </p>
        </div>
      </footer>
    </div>
  );
}
