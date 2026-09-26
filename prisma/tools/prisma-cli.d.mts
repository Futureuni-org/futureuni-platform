/** Runs `prisma <args>` from the repository root with extra environment variables; returns the exit code. */
export declare function prisma(args: string[], env?: Record<string, string>): number;
/** Prints a message and exits with code 1. */
export declare function fail(message: string): never;
