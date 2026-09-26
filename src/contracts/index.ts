/**
 * @/contracts: the typed interfaces between parts of the platform, one file per document in
 * docs/contracts/. Zod schemas with types derived by z.infer; no implementations, and no imports
 * from src/platform or src/modules.
 */

export * from "./common";
export * from "./permissions";
export * from "./jobs";
export * from "./events";
export * from "./ai-service";
export * from "./module-manifest";
export * from "./service-line-profile";
export * from "./source-adapter";
export * from "./enrichment";
export * from "./audit-agent";
export * from "./outreach-channel";
export * from "./acquisition-records";
