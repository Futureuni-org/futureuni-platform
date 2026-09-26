import type pg from "pg";

export type LocalDbMode = "native" | "docker";

export interface NativePaths {
  bin: string;
  data: string;
  log: string;
}

export declare function localSettings(root?: string): Record<string, string>;
export declare function dockerAvailable(): boolean;
export declare function resolveMode(
  settings: Readonly<Record<string, string | undefined>>,
  hasDocker?: () => boolean,
): LocalDbMode;
export declare function nativePaths(
  settings: Readonly<Record<string, string | undefined>>,
  platformIsWindows?: boolean,
): NativePaths;
export declare function pgTool(bin: string, name: string): string;
export declare function nativeInstallExists(paths: NativePaths): boolean;
export declare function databaseName(url: string): string;
export declare function withDatabase(url: string, name: string): string;
export declare function assertLocal(url: string): void;
export declare function withClient<T>(
  url: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T>;
export declare function databaseExists(client: pg.Client, name: string): Promise<boolean>;
export declare function createDatabase(
  client: pg.Client,
  name: string,
  template?: string,
): Promise<void>;
export declare function dropDatabase(client: pg.Client, name: string): Promise<void>;
export declare function waitForServer(url: string, timeoutMs?: number): Promise<void>;
