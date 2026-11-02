import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col bg-navy">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 geo-grid opacity-20"
      />
      <header className="relative border-b border-edge/60 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl">
          <Brand />
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl border border-edge bg-deepgreen/50">
            <Compass className="size-5 text-emerald" />
          </span>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-mint">
            error 404 · outside the footprint
          </p>
          <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink">
            This coordinate has no record
          </h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            The page does not exist. Your research records and calculations are
            still in the workspace.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              asChild
              className="h-11 gap-2 bg-emerald text-[#04130f] hover:bg-emerald/90"
            >
              <Link to="/workspace">
                Open workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 gap-2 border-edge bg-transparent text-ink"
            >
              <Link to="/">Back to overview</Link>
            </Button>
          </div>
        </div>
      </main>

      <p className="relative pb-8 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-mist/50">
        deterministic engine · tank-math/1.0.0
      </p>
    </div>
  );
}
