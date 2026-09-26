/*
 * jest-dom 7 augments Vitest's `Assertion<T>`, but Vitest 5 declares `Assertion<R, T>`, so the
 * matcher types are dropped (testing-library/jest-dom#738). This restores them through
 * Vitest 5's documented `Matchers<R, T>` extension point. The type parameters must match
 * Vitest's own declaration exactly. Remove this file once jest-dom supports Vitest 5 (PR #742).
 */
import "vitest";

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}
