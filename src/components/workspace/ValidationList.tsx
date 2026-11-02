import { StatusPill } from "./primitives";
import type {
  EvidenceBasis,
  ValidationCheck,
} from "@/lib/scientific-validation";

const BASIS_LABELS: Record<EvidenceBasis, string> = {
  "provider metadata": "from Copernicus",
  "deterministic rule": "fixed rule",
  "user-supplied input": "from you",
  "client-computed image statistic": "from this browser",
  "independent verification absent": "no independent check",
};

function CheckItems({ checks }: { checks: ValidationCheck[] }) {
  return (
    <ul className="space-y-2.5">
      {checks.map((check) => (
        <li
          key={check.id}
          className="rounded-xl border border-edge/60 bg-abyss/40 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill status={check.status} />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70">
              source: {BASIS_LABELS[check.basis]}
            </span>
          </div>
          <p className="mt-2.5 text-sm font-medium leading-5 text-ink">
            {check.label}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-mist">{check.detail}</p>
          <p className="mt-2 font-mono text-[10px] leading-4 text-mist/50">
            rule · {check.rule}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ValidationList({ checks }: { checks: ValidationCheck[] }) {
  // Older records predate `kind`; treat those as evidence checks.
  const evidence = checks.filter((check) => check.kind !== "scope-limit");
  const scopeLimits = checks.filter((check) => check.kind === "scope-limit");

  return (
    <div className="space-y-5">
      {evidence.length > 0 && (
        <section>
          <p className="eyebrow">Checks on this record</p>
          <p className="mt-1 text-xs leading-5 text-mist">
            Fixed rules that test the saved evidence.
          </p>
          <div className="mt-3">
            <CheckItems checks={evidence} />
          </div>
        </section>
      )}
      {scopeLimits.length > 0 && (
        <section>
          <p className="eyebrow">What this record cannot show</p>
          <p className="mt-1 text-xs leading-5 text-mist">
            These are limits, not failures. They are kept apart from the check
            results.
          </p>
          <div className="mt-3">
            <CheckItems checks={scopeLimits} />
          </div>
        </section>
      )}
    </div>
  );
}
