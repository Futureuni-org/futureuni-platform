"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

/**
 * Keyboard shortcut system.
 *
 *   const openPalette = useShortcut(["Meta+K", "Control+K"], () => setOpen(true));
 *
 * - `chord` supports single keys ("?", "Escape"), modified keys ("Meta+K", "Shift+Enter") and
 *   space-separated chord sequences ("g h" fires when the user presses g then h within 800ms).
 * - Skips when focus is inside an editable input unless `opts.input` is set.
 *
 * Registered shortcuts are also published to a small in-memory registry so `<ShortcutsOverlay>`
 * can list every binding active on the current screen ("?" opens it).
 */

interface Registration {
  id: string;
  chord: string[];
  description: string;
}

type Listener = () => void;
const registry = new Map<string, Registration>();
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

let nextId = 0;

function register(entry: Registration): () => void {
  registry.set(entry.id, entry);
  emit();
  return () => {
    registry.delete(entry.id);
    emit();
  };
}

export function useRegisteredShortcuts(): Registration[] {
  return useSyncExternalStore(
    subscribe,
    () => Array.from(registry.values()),
    () => [],
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function normaliseChord(chord: string): string {
  return chord
    .split("+")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .join("+");
}

function chordFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey) parts.push("Meta");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && event.key.length > 1) parts.push("Shift");
  parts.push(event.key);
  return parts.join("+");
}

export function useShortcut(
  chord: string | string[],
  handler: (event: KeyboardEvent) => void,
  opts: { enabled?: boolean; input?: boolean; description?: string } = {},
): void {
  const chords = useMemo(
    () =>
      (Array.isArray(chord) ? chord : [chord]).map((entry) =>
        entry
          .split(" ")
          .map((step) => normaliseChord(step))
          .filter((step) => step.length > 0),
      ),
    [chord],
  );
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (opts.enabled === false) return;
    const id = `sc-${String(nextId++)}`;
    const undoRegister = register({
      id,
      chord: chords.map((sequence) => sequence.join(" ")),
      description: opts.description ?? "",
    });

    let pending: string[] | null = null;
    let pendingTimer: number | undefined;

    function onKey(event: KeyboardEvent) {
      if (opts.input !== true && isEditableTarget(event.target)) return;
      const combo = chordFromEvent(event);
      for (const sequence of chords) {
        if (sequence.length === 1) {
          if (sequence[0] === combo) {
            event.preventDefault();
            handlerRef.current(event);
            return;
          }
          continue;
        }
        // Multi-step chord.
        const expectedNext = sequence[pending?.length ?? 0];
        if (expectedNext === combo) {
          const nextPending = [...(pending ?? []), combo];
          if (nextPending.length === sequence.length) {
            event.preventDefault();
            pending = null;
            handlerRef.current(event);
            return;
          }
          pending = nextPending;
          window.clearTimeout(pendingTimer);
          pendingTimer = window.setTimeout(() => {
            pending = null;
          }, 800);
          return;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(pendingTimer);
      undoRegister();
    };
  }, [chords, opts.enabled, opts.input, opts.description]);
}

/** Register a page-scoped command that shows up in the command palette. */
interface Command {
  id: string;
  label: string;
  group: "Navigate" | "Actions" | "Recent" | "Theme";
  shortcut?: string;
  perform: () => void;
}
const commandRegistry = new Map<string, Command>();
const commandListeners = new Set<Listener>();

function subscribeCommands(listener: Listener): () => void {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}

export function useCommandRegistry(): Command[] {
  return useSyncExternalStore(
    subscribeCommands,
    () => Array.from(commandRegistry.values()),
    () => [],
  );
}

export function useCommand(command: Command): void {
  const ref = useRef(command);
  useEffect(() => {
    ref.current = command;
  }, [command]);
  useEffect(() => {
    commandRegistry.set(command.id, ref.current);
    for (const listener of commandListeners) listener();
    return () => {
      commandRegistry.delete(command.id);
      for (const listener of commandListeners) listener();
    };
  }, [command.id]);
}

/** Convenience registration outside the React tree (module-level commands, if ever). */
export function registerCommand(command: Command): () => void {
  commandRegistry.set(command.id, command);
  for (const listener of commandListeners) listener();
  return () => {
    commandRegistry.delete(command.id);
    for (const listener of commandListeners) listener();
  };
}

export type { Command };
