/**
 * Hunter.io email-finder adapter (Phase 9, ADR-020). Reads the API key from the credentials
 * vault via `resolveProviderKey("hunter")`. All requests go through the platform's `safeFetch`
 * with `respectRobots: false` (API endpoint, not a crawl target).
 */

import "server-only";

import type { EmailFinder, FoundEmailSchema } from "@/contracts/enrichment";
import type { z } from "zod";

import { AppError } from "@/lib/errors";
import { resolveProviderKey } from "@/platform/credentials";
import { safeFetch } from "@/platform/http";

type FoundEmail = z.infer<typeof FoundEmailSchema>;

const BASE = "https://api.hunter.io/v2";

async function key(): Promise<string> {
  const apiKey = await resolveProviderKey("hunter");
  if (apiKey === null) throw new AppError("PROVIDER_ERROR", "Hunter API key not configured.");
  return apiKey;
}

interface DomainSearchResponse {
  data?: { emails?: { value: string; first_name?: string; last_name?: string; position?: string; confidence?: number; sources?: { uri?: string }[] }[] };
}

interface FindEmailResponse {
  data?: { email?: string; first_name?: string; last_name?: string; position?: string; score?: number; sources?: { uri?: string }[] };
}

export const hunterFinder: EmailFinder = {
  id: "hunter",
  async domainSearch(domain, opts) {
    const apiKey = await key();
    const url = `${BASE}/domain-search?domain=${encodeURIComponent(domain)}&limit=${String(opts?.limit ?? 25)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await safeFetch(url, { respectRobots: false, timeoutMs: 15_000 });
    if (!res.ok || res.body === null) return [];
    const body = safeJson(res.body) as DomainSearchResponse | null;
    const emails = body?.data?.emails ?? [];
    const out: FoundEmail[] = [];
    for (const raw of emails) {
      out.push({
        email: raw.value.toLowerCase(),
        ...(raw.first_name === undefined ? {} : { firstName: raw.first_name }),
        ...(raw.last_name === undefined ? {} : { lastName: raw.last_name }),
        ...(raw.position === undefined ? {} : { position: raw.position }),
        confidence: clamp(raw.confidence ?? 0),
        sources: (raw.sources ?? []).map((s) => s.uri).filter((u): u is string => u !== undefined),
      });
    }
    return out;
  },
  async findEmail(input) {
    const apiKey = await key();
    const url = `${BASE}/email-finder?domain=${encodeURIComponent(input.domain)}&first_name=${encodeURIComponent(input.firstName)}&last_name=${encodeURIComponent(input.lastName)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await safeFetch(url, { respectRobots: false, timeoutMs: 15_000 });
    if (!res.ok || res.body === null) return null;
    const body = safeJson(res.body) as FindEmailResponse | null;
    const data = body?.data;
    if (data?.email === undefined) return null;
    return {
      email: data.email.toLowerCase(),
      ...(data.first_name === undefined ? { firstName: input.firstName } : { firstName: data.first_name }),
      ...(data.last_name === undefined ? { lastName: input.lastName } : { lastName: data.last_name }),
      ...(data.position === undefined ? {} : { position: data.position }),
      confidence: clamp(data.score ?? 0),
      sources: (data.sources ?? []).map((s) => s.uri).filter((u): u is string => u !== undefined),
    };
  },
};

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
