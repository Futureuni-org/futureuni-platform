/**
 * Motion tokens and helpers (saas-ui `references/motion.md`, `.claude/project-rules.md` §Motion).
 *
 * Every animation in the platform reads from these constants. Only `transform`, `opacity` and
 * `filter` are animated. Exits are faster than entrances. Stagger is 30–60ms per item, and a
 * whole entrance stays under `MAX_ENTRANCE`.
 *
 * Mount `<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user">…` once
 * inside `(platform)/layout.tsx`. Components use `m.*` (from motion/react) — never the full
 * `motion.*` set — so the domAnimation feature bundle stays tree-shaken.
 */

"use client";

import { useReducedMotion } from "motion/react";

export const DURATION = {
  instant: 0.1,
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  deliberate: 0.6,
} as const;

export const EASE = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.05, 0.7, 0.1, 1] as const,
  exit: [0.3, 0, 0.8, 0.15] as const,
} as const;

export const SPRING = {
  snappy: { type: "spring", stiffness: 500, damping: 32, mass: 0.8 } as const,
  gentle: { type: "spring", stiffness: 200, damping: 28 } as const,
  bouncy: { type: "spring", stiffness: 350, damping: 14 } as const,
} as const;

/** Delay between staggered items (per saas-ui motion.md). */
export const STAGGER = 0.04;
/** Cap on the total length of any entrance animation (per saas-ui motion.md). */
export const MAX_ENTRANCE = 0.8;

/**
 * `useReducedMotion` returns `null` on the server and until Motion detects the OS preference.
 * `useReducedMotionSafe` collapses that to a boolean so components can branch cleanly.
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() === true;
}

// The canonical import surface for Motion. Feature bundles and the strict LazyMotion mount are
// wired at the root layout so `m.*` is the only motion API we ever call in components.
export { LazyMotion, MotionConfig, domAnimation, m, AnimatePresence } from "motion/react";
