import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  BrainCircuit,
  Loader2,
  Lock,
  Mail,
  ScanLine,
  UserX,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/workspace",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (caught) {
      console.error("Email sign-in error:", caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not send the code. Try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (caught) {
      console.error("OTP verification error:", caught);
      setError("That code is not correct. Try again.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (caught) {
      console.error("Guest login error:", caught);
      setError(
        `Could not sign in as a guest.${
          caught instanceof Error ? ` ${caught.message}` : " Try again."
        }`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px circle at 18% 10%, rgba(67,217,160,0.12), transparent 55%), radial-gradient(800px circle at 90% 90%, rgba(120,207,174,0.08), transparent 60%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 geo-grid opacity-25"
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between border-r border-edge/50 p-10 lg:flex xl:p-12">
          <Brand />

          <div className="max-w-md">
            <p className="eyebrow">Private workspace</p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-[1.08] tracking-tight text-ink text-balance">
              A research record
              <br />
              you can stand behind.
            </h1>
            <p className="mt-4 text-sm leading-6 text-mist">
              Real image data, fixed maths and check results stay with every
              report. No password needed. Use a one-time email code or a guest
              session.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: ScanLine,
                  title: "Data from Copernicus, not a rebuild",
                  copy: "Each image keeps the capture time, ID and cloud cover Copernicus returned.",
                },
                {
                  icon: BrainCircuit,
                  title: "AI comments. Maths decides.",
                  copy: "AI notes are stored on their own. They cannot change a calculation or a check result.",
                },
                {
                  icon: Lock,
                  title: "Your records stay yours",
                  copy: "The server checks who owns every record. Deleting a record can also delete its upload.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-edge bg-deepgreen/50">
                    <item.icon className="size-4 text-emerald" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-mist">{item.copy}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[10px] uppercase leading-5 tracking-[0.14em] text-mist/60">
            Copernicus Sentinel data · OpenStreetMap place lookup
            <br />
            fixed engine tank-math/1.0.0
          </p>
        </aside>

        <main className="flex items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              <Brand />
            </div>

            <div className="panel overflow-hidden">
              {step === "signIn" ? (
                <>
                  <div className="border-b border-edge/60 px-6 py-6 sm:px-8">
                    <p className="eyebrow">Sign in</p>
                    <h2 className="mt-2 font-display text-2xl font-medium text-ink">
                      Open the workspace
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-mist">
                      Your records are private. Use a one-time email code, or
                      continue as a guest to look around.
                    </p>
                  </div>
                  <form onSubmit={handleEmailSubmit}>
                    <div className="space-y-4 px-6 py-6 sm:px-8">
                      <label
                        htmlFor="auth-email"
                        className="mb-2 block text-xs text-mist"
                      >
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" />
                        <Input
                          id="auth-email"
                          name="email"
                          placeholder="name@example.com"
                          type="email"
                          className="h-11 border-edge bg-navy/60 pl-9 text-ink placeholder:text-mist/50"
                          disabled={isLoading}
                          required
                        />
                      </div>
                      {error && (
                        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
                          {error}
                        </p>
                      )}
                      <Button
                        type="submit"
                        className="h-11 w-full gap-2 bg-emerald font-semibold text-[#04130f] hover:bg-emerald/90"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                        Send code
                      </Button>

                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-edge/60" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-panel px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
                            or
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full gap-2 border-edge bg-transparent text-ink hover:bg-deepgreen/40"
                        onClick={() => void handleGuestLogin()}
                        disabled={isLoading}
                      >
                        <UserX className="size-4" />
                        Continue as guest
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="border-b border-edge/60 px-6 py-6 sm:px-8">
                    <p className="eyebrow">Verify</p>
                    <h2 className="mt-2 font-display text-2xl font-medium text-ink">
                      Check your email
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-mist">
                      We sent a six-digit code to{" "}
                      <span className="text-ink">{step.email}</span>.
                    </p>
                  </div>
                  <form onSubmit={handleOtpSubmit}>
                    <div className="space-y-4 px-6 py-6 sm:px-8">
                      <input type="hidden" name="email" value={step.email} />
                      <input type="hidden" name="code" value={otp} />
                      <div className="flex justify-center">
                        <InputOTP
                          value={otp}
                          onChange={setOtp}
                          maxLength={6}
                          disabled={isLoading}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              otp.length === 6 &&
                              !isLoading
                            ) {
                              const form = (event.target as HTMLElement).closest(
                                "form",
                              );
                              form?.requestSubmit();
                            }
                          }}
                        >
                          <InputOTPGroup className="[&_[data-slot=input-otp-slot]]:border-edge [&_[data-slot=input-otp-slot]]:bg-navy/60 [&_[data-slot=input-otp-slot]]:text-ink [&_[data-slot=input-otp-slot]]:size-11">
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      {error && (
                        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-center text-xs leading-5 text-danger">
                          {error}
                        </p>
                      )}
                      <Button
                        type="submit"
                        className="h-11 w-full gap-2 bg-emerald font-semibold text-[#04130f] hover:bg-emerald/90"
                        disabled={isLoading || otp.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Verifying…
                          </>
                        ) : (
                          <>
                            Verify and continue
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-0 text-xs text-mist hover:text-ink"
                          onClick={() => {
                            setStep("signIn");
                            setOtp("");
                            setError(null);
                          }}
                          disabled={isLoading}
                        >
                          Use a different email
                        </Button>
                        <span className="font-mono text-[10px] text-mist/60">
                          code expires soon
                        </span>
                      </div>
                    </div>
                  </form>
                </>
              )}

              <div className="border-t border-edge/60 bg-abyss/50 px-6 py-3 text-center sm:px-8">
                <p className="font-mono text-[10px] leading-4 tracking-[0.06em] text-mist/70">
                  signed-in records · guest sessions supported
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] leading-5 text-mist/70">
              By continuing, you agree to use this workspace for lawful research
              on public data. It does not monitor facility inventory.
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist transition hover:text-ink"
              >
                ← Back to home
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
