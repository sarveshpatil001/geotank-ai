import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Calculator,
  History as HistoryIcon,
  LogOut,
  Radar,
  Settings as SettingsIcon,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { Brand } from "../Brand";

const NAV = [
  { to: "/workspace", label: "Research", icon: Radar, end: true },
  { to: "/workspace/history", label: "History", icon: HistoryIcon, end: false },
  {
    to: "/workspace/calculator",
    label: "Calculator",
    icon: Calculator,
    end: false,
  },
  {
    to: "/workspace/settings",
    label: "Settings",
    icon: SettingsIcon,
    end: false,
  },
] as const;

export function WorkspaceShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="relative min-h-screen bg-navy">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(900px circle at 12% -10%, rgba(67,217,160,0.10), transparent 60%), radial-gradient(700px circle at 88% 0%, rgba(120,207,174,0.07), transparent 55%)",
        }}
      />

      <header className="print-hide sticky top-0 z-40 border-b border-edge/70 bg-navy/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand to="/workspace" />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Workspace">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-deepgreen/70 text-ink"
                      : "text-mist hover:bg-deepgreen/40 hover:text-ink",
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <span className="hidden max-w-[180px] truncate font-mono text-[10px] uppercase tracking-[0.12em] text-mist sm:block">
              {user?.email ?? "Guest session"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="text-mist hover:text-ink"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <div
          className="h-px w-full bg-gradient-to-r from-transparent via-emerald/40 to-transparent"
          aria-hidden="true"
        />
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-16 lg:px-8">
        <Outlet />

        <footer className="print-hide mt-14 flex flex-col gap-2 border-t border-edge/60 pt-5 text-[11px] leading-5 text-mist/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Contains modified Copernicus Sentinel data where images are
            referenced. Place lookup © OpenStreetMap contributors (ODbL).
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]">
            fixed engine · tank-math/1.0.0
          </p>
        </footer>
      </main>

      <nav
        className="print-hide safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-edge/70 bg-navy/95 backdrop-blur-xl md:hidden"
        aria-label="Workspace"
      >
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10px] font-medium tracking-wide transition-colors",
                  isActive ? "text-emerald" : "text-mist",
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
