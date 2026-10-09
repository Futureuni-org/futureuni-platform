"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The install affordance of the native `beforeinstallprompt` event. Not exported by TS DOM libs.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Hidden for the rest of this browser session once dismissed; returns on the next login. */
const DISMISS_KEY = "futureuni.pwa.install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari exposes installed state here instead of the display-mode media query.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// `useSyncExternalStore` with a never-changing store: false during SSR and the hydration render,
// true after commit on the client. This gates all browser-only visibility below so there's never a
// server/client hydration mismatch — without calling setState synchronously inside an effect.
const subscribe = () => () => undefined;
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/**
 * Platform-wide "Install app" banner, shown at the top of every signed-in page for workers who
 * have NOT installed the app on the current device/browser, and hidden for those running the
 * installed (standalone) app. Rendered beside `OutreachPausedBanner` in the shell.
 *
 * Detection is entirely client-side and per-device — "installed" is a fact about a browser, not a
 * person — which is exactly what gives the asked-for behaviour: browser tab shows it, installed
 * app does not. Role-agnostic: no props, no permission checks.
 *
 * - Chrome / Edge / Android / desktop: captures `beforeinstallprompt` and offers a one-tap install.
 * - iOS Safari (no programmatic install): offers "Add to Home Screen" instructions instead.
 */
export function InstallAppBanner() {
  const hydrated = useHydrated();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => wasDismissed());

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Stop Chrome's default mini-infobar; we present our own banner instead.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success("App installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode or storage disabled: just hide for this render.
    }
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt === null) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // The prompt can only be used once; drop it either way. `appinstalled` handles the toast.
    setDeferredPrompt(null);
    if (outcome === "dismissed") dismiss();
  }, [deferredPrompt, dismiss]);

  if (!hydrated || installed || dismissed || isStandalone()) return null;

  const canPrompt = deferredPrompt !== null;
  const showIosHelp = isIos();
  // Nothing actionable to show: not installable here and not iOS.
  if (!canPrompt && !showIosHelp) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-primary/30 bg-primary-soft px-4 py-2.5 text-sm text-primary-soft-foreground sm:px-6 lg:px-8"
    >
      <Download aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Install the FUTUREUNI app</span>
        <span className="hidden sm:inline"> for one-tap access from your home screen.</span>
      </p>

      {canPrompt ? (
        <Button variant="primary" size="sm" onClick={() => void install()} className="shrink-0">
          <Download aria-hidden className="size-4" />
          Install
        </Button>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="primary" size="sm" className="shrink-0">
              <Share aria-hidden className="size-4" />
              How to install
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="text-sm">
            <p className="mb-3 font-semibold text-foreground">Add to your Home Screen</p>
            <ol className="space-y-2 text-muted">
              <li className="flex items-center gap-2">
                <Share aria-hidden className="size-4 shrink-0 text-primary" />
                <span>
                  Tap the <span className="font-medium text-foreground">Share</span> button in the
                  browser toolbar.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus aria-hidden className="size-4 shrink-0 text-primary" />
                <span>
                  Choose <span className="font-medium text-foreground">Add to Home Screen</span>.
                </span>
              </li>
            </ol>
          </PopoverContent>
        </Popover>
      )}

      <IconButton
        aria-label="Dismiss install prompt"
        variant="ghost"
        onClick={dismiss}
        className="shrink-0"
      >
        <X aria-hidden className="size-4" />
      </IconButton>
    </div>
  );
}
