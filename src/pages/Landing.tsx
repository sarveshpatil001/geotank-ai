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
    detail: "live image data",
  },
  { icon: Ruler, label: "10 m / pixel", detail: "detail set by Copernicus" },
  { icon: Calculator, label: "tank-math/1.0.0", detail: "40 checks in the test suite" },
  { icon: BrainCircuit, label: "AI is optional", detail: "it cannot do the maths" },
];

const METHOD = [
  {
    icon: MapPin,
    title: "Find the area",
    copy: "Enter a place name or coordinates. You pick the right match. The search area is capped at 0.6°.",
    meta: "global coordinates · area ≤ 0.6°",
  },
  {
    icon: CalendarClock,
    title: "Set the capture date",
    copy: "Pick the day the image was taken. The app uses the whole UTC day. Capture, processing and upload times stay separate.",
    meta: "UTC 00:00 – 23:59",
  },
  {
    icon: Radar,
    title: "Search the image library",
    copy: "The app sends a read-only request to Copernicus. No results, timeouts and errors are shown as different outcomes.",
    meta: "Copernicus image service",
  },
  {
    icon: ShieldCheck,
    title: "Check, calculate, report",
    copy: "Fixed rules mark every claim. The calculator uses your inside sizes. The report keeps every status as recorded.",
    meta: "V = π r² H / V = π r² L",
  },
];

const LEDGER = [
  {
    label: "Image library search",
    status: "VERIFIED",
    copy: "A live Copernicus search returned real Sentinel-2 images during development. An empty result is shown apart from a failed request.",
  },
  {
    label: "Tank calculation engine",
    status: "TESTED",
    copy: "Tests cover known volumes, unit changes, bad inputs, size limits and rounding.",
  },
  {
    label: "Record checks",
    status: "TESTED",
    copy: "Tests cover cloud limits, date mismatches, upload source and liquid-level limits.",
  },
  {
    label: "Image uploads",
    status: "IMPLEMENTED",
    copy: "The browser checks the file. The server checks it again. The full browser upload flow has not been checked visually.",
  },
  {
    label: "AI commentary",
    status: "IMPLEMENTED",
    copy: "The prompt gets text data only. Output is checked before storage. It is never treated as fact.",
  },
  {
    label: "Research report",
    status: "IMPLEMENTED",
    copy: "A fixed report uses the saved statuses. It never invents an accuracy score.",
  },
];

const APP_AT = [
  "Search by place and capture date",
  "See Copernicus image data and a preview",
  "View the image, map outline and file list",
  "Read AI notes apart from the evidence",
  "See every check and its result",
  "Calculate tank capacity with unit conversion",
  "Download a report and review past records",
  "Export or delete your data, with an activity log",
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
              How it works
            </a>
            <a
              href="#boundaries"
              className="text-xs text-mist transition hover:text-ink"
            >
              Limits
            </a>
            <a
              href="#ledger"
              className="text-xs text-mist transition hover:text-ink"
            >
              Build status
            </a>
            <a
              href="https://documentation.dataspace.copernicus.eu/APIs/STAC.html"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-mist transition hover:text-ink"
            >
              Copernicus docs <ExternalLink className="size-3" />
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
                Satellite research workspace · v1
              </span>
            </div>

            <h1 className="mt-6 font-display text-[2.6rem] font-medium leading-[1.02] tracking-tight text-ink text-balance sm:text-6xl">
              Satellite evidence.
              <br />
              Fixed maths.
              <br />
              <span className="text-emerald">Clear limits.</span>
            </h1>

            <p className="mt-6 max-w-xl text-sm leading-7 text-mist sm:text-base">
              Search real Copernicus Sentinel-2 images for a place and a date.
              See exactly what Copernicus returned. Then calculate ideal tank
              capacity with a tested formula. The app keeps what was seen, what
              was calculated and what cannot be known in separate boxes.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="h-12 gap-2 bg-emerald px-5 font-semibold text-[#04130f] hover:bg-emerald/90"
              >
                <Link to="/auth?returnTo=/workspace">
                  Start a search <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 gap-2 border-edge bg-transparent px-5 text-ink hover:bg-deepgreen/40"
              >
                <Link to="/auth?returnTo=/workspace/calculator">
                  <Calculator className="size-4" /> Open calculator
                </Link>
              </Button>
            </div>

            <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-mist/60">
              <Lock className="size-3" />
              free and open data · AI is optional
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative overflow-hidden p-5 glow-emerald sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Request → record</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-mist/60">
                how it works
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
                    ["01", "Find area", "place or coordinates"],
                    ["02", "Capture date", "whole UTC day"],
                    ["03", "Search images", "Copernicus · read only"],
                    ["04", "Check & report", "statuses stay attached"],
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
                source · Copernicus
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-mint">
                <ShieldCheck className="size-3" /> checks attached
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
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
              Four steps. Every one leaves a record.
            </h2>
            <p className="mt-4 text-sm leading-7 text-mist">
              You only need two inputs. Optional filters are marked. Every extra
              request says what it is for. Nothing changes behind your back.
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
              <p className="eyebrow">What the app will not claim</p>
              <h2 className="mt-3 max-w-lg font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                Some things this app refuses to say.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-mist">
                A visible tank roof does not show the liquid level. A formula
                does not measure inventory. A 10 m pixel is not a survey. These
                are hard rules in the code, not small print.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  {
                    title: "Liquid level inside a tank",
                    copy: "Satellite images show the outside of a tank. The app marks this as NOT MEASURABLE and will not estimate a fill height.",
                  },
                  {
                    title: "Liquid inventory",
                    copy: "Inventory needs approved measurements, tank tables, temperature and product data. This app does not estimate it.",
                  },
                  {
                    title: "Small tank sizes from Sentinel-2",
                    copy: "At 10 m per pixel, a 20–40 m tank is only 2–4 pixels wide. The app cannot measure it to engineering accuracy.",
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
                  <p className="eyebrow">Fixed maths</p>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="font-mono text-xs text-mint">V = π × r² × H</p>
                    <p className="mt-1 text-[11px] text-mist">
                      Upright cylinder · uses inside radius and inside height
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
                    Units are clear. Inputs are range-checked. Values are not
                    rounded midway. The server recomputes the saved result.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-edge/60 bg-abyss/60 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-mist/70">
                    capacity
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink">
                    A geometric volume. Exact for a perfect cylinder.
                  </p>
                </div>
                <div className="rounded-xl border border-edge/60 bg-abyss/60 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-mist/70">
                    inventory
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink">
                    A physical measurement. This tool does not make it.
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
              <p className="eyebrow">Build status</p>
              <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                Built, tested and checked — kept separate.
              </h2>
              <p className="mt-4 text-sm leading-7 text-mist">
                These labels describe evidence gathered during development. The
                app also shows them beside its limits.
              </p>
            </div>
            <span className="rounded-full border border-edge bg-abyss/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
v1 · one researcher
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
                Research that ends in a record, not a guess.
              </h3>
              <p className="mt-3 text-xs leading-6 text-mist">
                Every screen uses saved data. No sample results are hard-coded.
                Any future demo data must be labelled DEMO.
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
                  A place, a date, and an honest record.
                </h2>
                <p className="mt-3 text-sm leading-6 text-mist">
                  You only need a location and a capture date. The calculator
                  works on its own.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  asChild
                  className="h-11 gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
                >
                  <Link to="/auth?returnTo=/workspace">Search images</Link>
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
              Contains modified Copernicus Sentinel data where images are
              referenced. Sentinel data is used under the Copernicus Sentinel Data
              Legal Notice. Geocoding © OpenStreetMap contributors (ODbL).
            </p>
          </div>
          <div className="grid gap-2 text-[11px] text-mist">
            <span className="flex items-center gap-1.5">
              <Satellite className="size-3.5 text-emerald" />
              Copernicus Data Space Ecosystem · STAC v1
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-emerald" />
              Convex records and protected file storage
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="size-3.5 text-emerald" />
              Reports use recorded statuses, not upbeat summaries
            </span>
          </div>
          <p className="max-w-xs font-mono text-[9px] uppercase leading-5 tracking-[0.12em] text-mist/60">
            For public educational research only. Not for watching facilities,
            tracking stock or measuring tank contents.
          </p>
        </div>
      </footer>
    </div>
  );
}
