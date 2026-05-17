"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ModeCards, { type WizardMode } from "@/app/onboarding/install/components/mode-cards";
import HybridForm, { type HybridFormState } from "@/app/onboarding/install/components/hybrid-form";
import LocalForm, { type LocalFormState } from "@/app/onboarding/install/components/local-form";
import InstallCommandDisplay from "@/app/onboarding/install/components/install-command-display";
import WizardStepper from "@/app/onboarding/install/components/wizard-stepper";
import ModeDocs from "@/app/onboarding/install/components/mode-docs";

/**
 * /dashboard/install — install wizard wrapped in dashboard shell.
 *
 * Shipped 2026-05-14: matches /dashboard's design (zinc palette, rounded-xl
 * cards, light/dark, max-w-4xl shell). New users with zero devices auto-land
 * here from /dashboard. Direct /onboarding/install redirects here for
 * backward compat. The wizard logic itself is identical to the standalone
 * /onboarding/install page — only the chrome differs.
 */
interface UserSummary {
  username: string;
  emailVerified: boolean;
}

export default function DashboardInstallPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSummary | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<WizardMode>("hybrid");
  const [hybrid, setHybrid] = useState<HybridFormState>({
    subdomain: "", baseDomain: "", cfTunnelToken: "",
  });
  const [local, setLocal] = useState<LocalFormState>({ hostname: "livinity" });
  const [genState, setGenState] = useState<{
    status: "idle" | "minting" | "ready" | "error";
    keyId?: string;
    plainKey?: string;
    error?: string;
  }>({ status: "idle" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { credentials: "same-origin" });
        if (res.status === 401) { router.push("/login?redirect=/dashboard/install"); return; }
        const d = await res.json();
        setUser({ username: d.user.username, emailVerified: d.user.emailVerified });
      } catch {
        router.push("/login?redirect=/dashboard/install");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (step !== 3) return;
    if (genState.status === "ready" || genState.status === "minting") return;
    setGenState({ status: "minting" });
    (async () => {
      try {
        const res = await fetch("/api/account/api-keys", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setGenState({ status: "error", error: body.error ?? `HTTP ${res.status}` });
          return;
        }
        const body = await res.json();
        setGenState({ status: "ready", keyId: body.id, plainKey: body.apiKey });
      } catch (e) {
        setGenState({ status: "error", error: String(e) });
      }
    })();
  }, [step, genState.status]);

  function handleBack() {
    if (step === 3 && genState.keyId) {
      fetch(`/api/account/api-keys/${genState.keyId}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    }
    setGenState({ status: "idle" });
    setStep(Math.max(1, step - 1) as 1 | 2 | 3);
  }

  function handleSkip() {
    if (step === 3 && genState.keyId) {
      fetch(`/api/account/api-keys/${genState.keyId}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    }
    router.push("/dashboard?skipFirstRun=1");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function canAdvanceFromStep2(): boolean {
    if (mode === "local-lan") return !!local.hostname.trim();
    if (mode === "hybrid") {
      const sub = hybrid.subdomain.trim();
      const base = hybrid.baseDomain.trim();
      const token = hybrid.cfTunnelToken.trim();
      return (
        sub.length > 0 &&
        /^[a-z0-9-]+$/.test(sub) &&
        base.length > 2 &&
        base.includes(".") &&
        token.length >= 100 &&
        /^[A-Za-z0-9+/=_-]+$/.test(token)
      );
    }
    return false;
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  const stepLabel = step === 1 ? "Choose mode" : step === 2 ? "Configure" : "Install command";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Dashboard header — matches /dashboard exactly */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Livinity</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user.username}</span>
            <button onClick={handleLogout} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Hero */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Step {step} of 3 · {stepLabel}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Set up your first LivOS
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pick how you&apos;ll run LivOS, then we&apos;ll generate a one-line install command you paste on your machine.
          </p>
        </div>

        {/* Email verification warning (parity with /dashboard) */}
        {!user.emailVerified && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Verify your email address before generating an API key.
            </p>
          </div>
        )}

        {/* Stepper visual */}
        <WizardStepper current={step} total={3} />

        {/* Step content card */}
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Choose your mode</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Local for home use, Hybrid for public access via your domain. Own-Cloud + Cloud are coming soon.
                </p>
              </div>
              <ModeCards value={mode} onChange={setMode} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {mode === "hybrid" ? (
                <HybridForm state={hybrid} onChange={setHybrid} />
              ) : mode === "local-lan" ? (
                <LocalForm state={local} onChange={setLocal} />
              ) : (
                <p className="text-sm text-zinc-500">This mode is coming soon. Pick Local or Hybrid above.</p>
              )}
            </div>
          )}

          {step === 3 && (
            <InstallCommandDisplay mode={mode} hybrid={hybrid} local={local} gen={genState} />
          )}
        </div>

        {/* Mode reference docs */}
        <ModeDocs />

        {/* Bottom navigation */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Back
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(3, s + 1) as 1 | 2 | 3)}
                disabled={step === 2 && !canAdvanceFromStep2()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {step === 1 ? "Continue" : "Generate install command"}
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Done — go to dashboard
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
