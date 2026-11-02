import { StatusPill } from "./primitives";
import type { ValidationCheck } from "@/lib/scientific-validation";

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
              basis: {check.basis}
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
          <p className="eyebrow">Evidence checks</p>
          <p className="mt-1 text-xs leading-5 text-mist">
            Deterministic checks that assess the recorded evidence.
          </p>
          <div className="mt-3">
            <CheckItems checks={evidence} />
          </div>
        </section>
      )}
      {scopeLimits.length > 0 && (
        <section>
          <p className="eyebrow">Scope limits</p>
          <p className="mt-1 text-xs leading-5 text-mist">
            What this record cannot establish, kept separate from its evidence
            status.
          </p>
          <div className="mt-3">
            <CheckItems checks={scopeLimits} />
          </div>
        </section>
      )}
    </div>
  );
}
