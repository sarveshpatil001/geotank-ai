import { Link } from "react-router";

import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
  to = "/",
}: {
  compact?: boolean;
  className?: string;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald/50",
        className,
      )}
      aria-label="Tank Calculator AI home"
    >
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-edge bg-deepgreen/60">
        <span className="absolute inset-0 geo-grid-fine opacity-60" />
        <svg
          viewBox="0 0 32 32"
          className="relative size-7"
          aria-hidden="true"
          fill="none"
        >
          <ellipse
            cx="16"
            cy="16"
            rx="14"
            ry="5.5"
            stroke="#43D9A0"
            strokeOpacity="0.55"
            strokeWidth="1.2"
            transform="rotate(-18 16 16)"
          />
          <rect x="9" y="9" width="14" height="3.2" fill="#43D9A0" />
          <rect x="9" y="12.2" width="3" height="11" fill="#43D9A0" opacity="0.85" />
          <rect x="20" y="12.2" width="3" height="11" fill="#43D9A0" opacity="0.85" />
          <rect x="12" y="12.2" width="8" height="3" fill="#78CFAE" />
          <rect x="12" y="15.2" width="3" height="6.4" fill="#78CFAE" />
          <rect x="18" y="15.2" width="2" height="6.4" fill="#78CFAE" />
          <rect x="12" y="21.6" width="8" height="1.6" fill="#43D9A0" opacity="0.7" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[13px] font-semibold tracking-[0.13em] text-ink">
            TANK CALCULATOR <span className="text-emerald">AI</span>
          </span>
          <span className="mt-1 font-mono text-[9px] tracking-[0.26em] text-mist">
            SATELLITE RESEARCH
          </span>
        </span>
      )}
    </Link>
  );
}
