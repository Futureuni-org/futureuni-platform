/** The repository (or worktree) root that contains this scripts folder. */
export declare const REPO_ROOT: string;

/** Parses .env text into a key/value object. */
export declare function parseEnvText(text: string): Record<string, string>;

/** Reads an .env file; a missing file reads as empty. */
export declare function readEnvFile(path: string): Record<string, string>;

/** Sets keys in .env text, keeping comments, order and every other line; appends missing keys. */
export declare function setEnvValues(
  text: string,
  values: Readonly<Record<string, string | number>>,
): string;
