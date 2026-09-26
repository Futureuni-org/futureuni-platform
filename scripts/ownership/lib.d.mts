export interface PhaseEntry {
  name?: string;
  owns: string[];
  alsoAllow: string[];
}

export interface OwnershipMap {
  alwaysAllowed: string[];
  phases: Record<string, PhaseEntry>;
}

export interface Decision {
  allowed: boolean;
  reason: "always-allowed" | "owned" | "granted" | "unowned" | "owned-by-another";
  owner?: string | null;
}

export declare function loadOwnershipMap(file: string): OwnershipMap;
export declare function globToRegExp(pattern: string): RegExp;
export declare function matchesGlob(path: string, pattern: string): boolean;
export declare function specificity(pattern: string): [number, number, number];
export declare function ownerOf(
  path: string,
  map: OwnershipMap,
): { phase: string; pattern: string } | undefined;
export declare function decide(input: { path: string; phase: string; map: OwnershipMap }): Decision;
export declare function denialMessage(phase: string, path: string, owner: string | null): string;
export declare function phaseFromBranch(branch: string | null | undefined): string | null;
export declare function findDuplicateOwners(
  map: OwnershipMap,
): { pattern: string; phases: string[] }[];
export declare function parseClaudeOwnershipTable(markdown: string): Record<string, string[]>;
export declare function compareWithClaudeTable(
  map: OwnershipMap,
  table: Record<string, string[]>,
): { phase: string; pattern: string; missingFrom: "CLAUDE.md" | "ownership.json" }[];
export declare function folderOf(pattern: string): string | null;
