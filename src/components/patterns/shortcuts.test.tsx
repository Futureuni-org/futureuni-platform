import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useShortcut } from "./shortcuts";

function press(init: KeyboardEventInit, target: EventTarget = window): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
}

describe("useShortcut", () => {
  it("matches Control+K when the browser reports the key as lowercase 'k'", () => {
    // Regression: `event.key` is "k" for Ctrl+K (it is only "K" with Shift held), while the
    // registration is written "Control+K". The palette shortcut never fired before the
    // case-insensitive canonicalisation.
    const handler = vi.fn();
    renderHook(() => {
      useShortcut(["Meta+K", "Control+K"], handler);
    });

    press({ key: "k", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);

    press({ key: "k", metaKey: true });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not fire a modified chord on the bare key", () => {
    const handler = vi.fn();
    renderHook(() => {
      useShortcut("Control+K", handler);
    });

    press({ key: "k" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("matches single printable keys regardless of the registered case", () => {
    const handler = vi.fn();
    renderHook(() => {
      useShortcut("n", handler);
    });

    press({ key: "n" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("matches '?' (Shift is folded into the printable key)", () => {
    const handler = vi.fn();
    renderHook(() => {
      useShortcut("?", handler);
    });

    press({ key: "?", shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("skips events from editable targets unless opts.input is set", () => {
    const handler = vi.fn();
    const withInput = vi.fn();
    renderHook(() => {
      useShortcut("k", handler);
      useShortcut("k", withInput, { input: true });
    });

    const field = document.createElement("input");
    document.body.appendChild(field);
    press({ key: "k" }, field);
    expect(handler).not.toHaveBeenCalled();
    expect(withInput).toHaveBeenCalledTimes(1);
    field.remove();
  });
});
