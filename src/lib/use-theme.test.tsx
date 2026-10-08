import { runInThisContext } from "node:vm";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_SCRIPT, THEME_STORAGE_KEY, useTheme } from "@/lib/theme";

/** A minimal consumer, the way Phase 4's toggle will use the hook. */
function ThemeButtons() {
  const { preference, theme, setPreference } = useTheme();
  return (
    <div>
      <p>
        Preference {preference}, showing {theme}
      </p>
      <button
        type="button"
        onClick={() => {
          setPreference("dark");
        }}
      >
        Dark
      </button>
      <button
        type="button"
        onClick={() => {
          setPreference("system");
        }}
      >
        System
      </button>
    </div>
  );
}

/** jsdom has no matchMedia; this stands in for the OS colour-scheme preference. */
function mockSystemTheme(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const state = { prefersDark };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return state.prefersDark && query === "(prefers-color-scheme: dark)";
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    /** The OS switches colour scheme while the page is open. */
    change(next: boolean) {
      state.prefersDark = next;
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("switches to dark, saves the choice and sets data-theme", async () => {
    mockSystemTheme(false);
    const user = userEvent.setup();
    render(<ThemeButtons />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByText("Preference dark, showing dark")).toBeInTheDocument();
  });

  it("follows the OS preference when set to system", async () => {
    mockSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    render(<ThemeButtons />);

    await user.click(screen.getByRole("button", { name: "System" }));

    // Every choice is saved explicitly, "system" included: an absent key means "no choice yet"
    // and resolves to the light default instead of silently following the OS.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("Preference system, showing dark")).toBeInTheDocument();
  });

  it("follows an OS change while set to system", () => {
    const os = mockSystemTheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(<ThemeButtons />);

    act(() => {
      os.change(true);
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("Preference system, showing dark")).toBeInTheDocument();
  });

  it("ignores the OS preference when no choice has been made", () => {
    const os = mockSystemTheme(true);
    render(<ThemeButtons />);

    act(() => {
      os.change(true);
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByText("Preference light, showing light")).toBeInTheDocument();
  });

  it("keeps the choice for the page when storage can't save it", async () => {
    mockSystemTheme(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const user = userEvent.setup();
    render(<ThemeButtons />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("Preference dark, showing dark")).toBeInTheDocument();

    // Once storage works again, a saved choice replaces the page-only one.
    vi.restoreAllMocks();
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByText("Preference system, showing light")).toBeInTheDocument();
  });
});

describe("THEME_SCRIPT (runs before the first paint)", () => {
  const runScript = (): void => {
    runInThisContext(THEME_SCRIPT);
  };

  it("applies the saved choice first", () => {
    mockSystemTheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the OS for a saved system choice, and light without a choice", () => {
    mockSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    runScript();
    expect(document.documentElement.dataset.theme).toBe("dark");

    // No saved choice is the platform default, light, even while the OS prefers dark.
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    runScript();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to light when storage is blocked", () => {
    mockSystemTheme(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    runScript();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
