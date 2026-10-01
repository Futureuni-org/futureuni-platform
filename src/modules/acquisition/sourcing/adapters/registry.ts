import "server-only";

/**
 * The source-adapter registry (Phase 8). Maps each `SourceAdapterId` to its real and mock
 * implementations; `getAdapter` returns the mock when `MOCKS` is on (or whenever a provider key is
 * absent, the adapters handle that themselves). Disabled adapters are returned as-is so the plan
 * resolver can report them; they never run (source-adapter.md rule 11).
 */

import type { SourceAdapterId } from "@/contracts/source-adapter";
import { env } from "@/env";

import type { AnySourceAdapter } from "./types";

import googlePlaces from "./google-places";
import googlePlacesMock from "./google-places/mock";
import jobsSerpapi from "./jobs-serpapi";
import jobsSerpapiMock from "./jobs-serpapi/mock";
import jobsAdzuna from "./jobs-adzuna";
import jobsAdzunaMock from "./jobs-adzuna/mock";
import jobberman from "./jobberman";
import jobbermanMock from "./jobberman/mock";
import myjobmag from "./myjobmag";
import myjobmagMock from "./myjobmag/mock";
import youtubeChannels from "./youtube-channels";
import youtubeChannelsMock from "./youtube-channels/mock";
import appleAppStore from "./apple-app-store";
import appleAppStoreMock from "./apple-app-store/mock";
import csvImport from "./csv-import";
import csvImportMock from "./csv-import/mock";
import manual from "./manual";
import manualMock from "./manual/mock";

interface Entry {
  real: AnySourceAdapter;
  mock: AnySourceAdapter;
}

const ENTRIES: Readonly<Record<SourceAdapterId, Entry>> = {
  "google-places": { real: googlePlaces, mock: googlePlacesMock },
  "jobs-serpapi": { real: jobsSerpapi, mock: jobsSerpapiMock },
  "jobs-adzuna": { real: jobsAdzuna, mock: jobsAdzunaMock },
  jobberman: { real: jobberman, mock: jobbermanMock },
  myjobmag: { real: myjobmag, mock: myjobmagMock },
  "youtube-channels": { real: youtubeChannels, mock: youtubeChannelsMock },
  "apple-app-store": { real: appleAppStore, mock: appleAppStoreMock },
  "csv-import": { real: csvImport, mock: csvImportMock },
  manual: { real: manual, mock: manualMock },
};

export const ALL_ADAPTER_IDS = Object.keys(ENTRIES) as SourceAdapterId[];

/** The implementation selected by MOCKS for an adapter id. */
export function getAdapter(id: SourceAdapterId): AnySourceAdapter {
  const entry = ENTRIES[id];
  return env.MOCKS ? entry.mock : entry.real;
}

/** Every adapter (MOCKS-selected), for the Search panel's source list. */
export function listAdapters(): AnySourceAdapter[] {
  return ALL_ADAPTER_IDS.map((id) => (env.MOCKS ? ENTRIES[id].mock : ENTRIES[id].real));
}
