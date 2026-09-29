/**
 * The runtime job registry.
 *
 * Every job used by the platform comes from `getAllJobs()` (the module registry, filled by each
 * manifest) plus the platform jobs list. Lookup is by `name`.
 */

import "server-only";

import type { AnyJobDefinition, JobName } from "@/contracts/jobs";
import { getAllJobs } from "@/platform/registry";

import { platformJobs } from "./platform-jobs";

let cache: Map<string, AnyJobDefinition> | null = null;

function ensure(): Map<string, AnyJobDefinition> {
  if (cache !== null) return cache;
  const map = new Map<string, AnyJobDefinition>();
  for (const job of platformJobs) map.set(job.name, job);
  for (const job of getAllJobs()) map.set(job.name, job);
  cache = map;
  return map;
}

export function _resetJobRegistry(): void {
  cache = null;
}

export function getJob(name: JobName): AnyJobDefinition | null {
  return ensure().get(name) ?? null;
}

export function listAllJobs(): AnyJobDefinition[] {
  return [...ensure().values()];
}
