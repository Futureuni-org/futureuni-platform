export declare const USAGE: string;

export type PhaseCommand =
  | { command: "list" }
  | { command: "start"; nn: string; slug: string }
  | { command: "finish" | "remove"; nn: string; yes: boolean; force: boolean };

export declare function parsePhaseArgs(argv: readonly string[]): PhaseCommand;
export declare function branchName(nn: string, slug: string): string;
export declare function worktreePath(mainRoot: string, nn: string, slug: string): string;
export declare function phasePort(nn: string): number;
export declare function phaseDatabases(nn: string): { dev: string; test: string };
export declare function phaseEnvValues(
  mainEnv: Readonly<Record<string, string | undefined>>,
  nn: string,
): Record<string, string>;
export declare function mergeProcedure(readme: string): string;
export declare function parseWorktreeList(
  porcelain: string,
): { path: string; branch: string | null }[];
