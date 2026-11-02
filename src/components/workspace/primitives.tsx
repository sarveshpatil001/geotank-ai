import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  CHECK_STATUS_STYLES,
  type CheckStatus,
} from "@/lib/scientific-validation";

export function StatusPill({
  status,
  className,
}: {
  status: CheckStatus;
  className?: string;
}) {
  const styles = CHECK_STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.12em]",
        styles.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {styles.label}
    </span>
  );
}

export function EvidenceTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.16em] text-mist",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-1.5 font-display text-xl font-medium text-ink sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm leading-6 text-mist">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  icon: Icon,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title: string;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-edge bg-abyss/80 text-mist",
    warn: "border-warn/35 bg-warn/[0.06] text-warn/90",
    danger: "border-danger/40 bg-danger/[0.07] text-danger/90",
    success: "border-emerald/30 bg-emerald/[0.05] text-mint",
  } as const;
  return (
    <div className={cn("rounded-xl border p-4", tones[tone], className)}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0">
          <p className="font-display text-sm font-medium text-ink">{title}</p>
          {children && (
            <div className="mt-1.5 text-xs leading-5 text-mist">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  mono = false,
  breakAll = false,
  href,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  breakAll?: boolean;
  href?: string;
}) {
  return (
    <div className="min-w-0 border-t border-edge/50 py-2.5 first:border-t-0 first:pt-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist/80">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm leading-6 text-ink",
          mono && "font-mono text-xs",
          breakAll && "break-all",
        )}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-emerald underline decoration-emerald/30 underline-offset-4 transition hover:decoration-emerald"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function Panel({
  children,
  className,
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div className={cn(flat ? "panel-flat" : "panel", "p-5", className)}>
      {children}
    </div>
  );
}

export function InlineSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-mist">
      <Loader2 className="size-3.5 animate-spin text-emerald" aria-hidden="true" />
      {label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge/80 bg-abyss/40 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-edge bg-deepgreen/50">
        <Icon className="size-5 text-emerald" />
      </span>
      <h3 className="mt-4 font-display text-base font-medium text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-mist">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-edge/70 bg-abyss/60 px-4 py-3",
        emphasis && "border-emerald/30 bg-emerald/[0.06]",
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist/80">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-display text-lg font-medium text-ink",
          emphasis && "text-emerald",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-mist">{hint}</p>}
    </div>
  );
}
