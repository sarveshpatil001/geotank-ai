import { ImageOff, Satellite } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders only a URL that actually exists in a stored record. There is no
 * synthetic imagery and no placeholder that could be mistaken for a capture.
 */
export function ImagePreview({
  src,
  alt,
  caption,
  note,
  className,
  aspect = "video",
}: {
  src: string | null;
  alt: string;
  caption?: string;
  note?: string;
  className?: string;
  aspect?: "video" | "square";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  const ratio = aspect === "video" ? "aspect-video" : "aspect-square";

  return (
    <figure className={cn("min-w-0", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-edge/80 bg-[#081a20]",
          ratio,
        )}
      >
        <div className="absolute inset-0 geo-grid opacity-40" aria-hidden="true" />
        {src && !failed ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedSrc(src)}
            className="relative size-full object-cover"
          />
        ) : (
          <div className="relative flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
            {src ? (
              <ImageOff className="size-6 text-mist" />
            ) : (
              <Satellite className="size-6 text-mist" />
            )}
            <p className="max-w-xs text-xs leading-5 text-mist">
              {src
                ? "The preview could not be loaded. The metadata record is unaffected; no substitute image is shown."
                : "No preview asset exists for this record. No image is fabricated."}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded border border-edge/80 bg-navy/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-mint backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald" aria-hidden="true" />
          preview
        </div>
      </div>
      {(caption || note) && (
        <figcaption className="mt-2 space-y-1">
          {caption && <p className="text-xs leading-5 text-mist">{caption}</p>}
          {note && (
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">
              {note}
            </p>
          )}
        </figcaption>
      )}
    </figure>
  );
}
