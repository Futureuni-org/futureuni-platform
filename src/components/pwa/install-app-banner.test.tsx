import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallAppBanner } from "./install-app-banner";

// sonner needs a mounted <Toaster/> to render; the banner only calls toast.success on install.
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const DISMISS_KEY = "futureuni.pwa.install-dismissed";
const realUserAgent = window.navigator.userAgent;

/** Stand-in for the browser's `beforeinstallprompt` event (not in TS DOM libs). */
function makeInstallPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  return Object.assign(new Event("beforeinstallprompt"), {
    platforms: ["web"],
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  });
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "(display-mode: standalone)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  window.sessionStorage.clear();
  // jsdom has no matchMedia; default to "not standalone" unless a test overrides it.
  setStandalone(false);
});

afterEach(() => {
  setUserAgent(realUserAgent);
  // @ts-expect-error -- remove the per-test mock so the next test re-seeds it.
  delete window.matchMedia;
});

describe("InstallAppBanner", () => {
  it("shows an Install button once the browser offers to install", () => {
    render(<InstallAppBanner />);
    // Nothing to show before the browser fires the event.
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      window.dispatchEvent(makeInstallPromptEvent());
    });

    expect(screen.getByRole("status")).toHaveTextContent("Install the FUTUREUNI app");
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  it("triggers the native prompt when Install is clicked", async () => {
    render(<InstallAppBanner />);
    const event = makeInstallPromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
      await event.userChoice;
    });

    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it("hides when the app reports it has been installed", () => {
    render(<InstallAppBanner />);
    act(() => {
      window.dispatchEvent(makeInstallPromptEvent());
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing when already running as the installed (standalone) app", () => {
    setStandalone(true);
    render(<InstallAppBanner />);
    act(() => {
      window.dispatchEvent(makeInstallPromptEvent());
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismissing hides the banner and remembers it for the session", () => {
    render(<InstallAppBanner />);
    act(() => {
      window.dispatchEvent(makeInstallPromptEvent());
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss install prompt" }));
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(window.sessionStorage.getItem(DISMISS_KEY)).toBe("1");
  });

  it("stays hidden on later renders once dismissed this session", () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    render(<InstallAppBanner />);
    act(() => {
      window.dispatchEvent(makeInstallPromptEvent());
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Add-to-Home-Screen instructions on iOS (no install event)", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    render(<InstallAppBanner />);
    // iOS never fires beforeinstallprompt, so the banner appears immediately with instructions.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How to install" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });
});
