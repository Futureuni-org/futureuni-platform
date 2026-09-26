/**
 * Where the development seed may run (data-model §10.1). It writes invented people and companies
 * and resets seeded rows, so it refuses production outright and refuses any database that isn't
 * on this machine unless SEED_ALLOW_REMOTE=1 names a non-production (preview) database.
 */

/** Local hosts: this machine, or the docker-compose service. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
]);

export interface SeedTargetEnv {
  NODE_ENV?: string | undefined;
  VERCEL_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  SEED_ALLOW_REMOTE?: string | undefined;
}

/** Connection-string parameters that would send the connection somewhere other than the host. */
const HOST_OVERRIDES = ["host", "hostaddr", "port"];

/**
 * Why the seed must not run against this environment, or null when it may. A remote database
 * needs both SEED_ALLOW_REMOTE=1 and VERCEL_ENV=preview (a Neon preview branch), never production.
 */
export function seedTargetProblem(env: SeedTargetEnv): string | null {
  if (env.NODE_ENV === "production") return "The seed never runs with NODE_ENV=production.";
  if (env.VERCEL_ENV === "production") return "The seed never runs in the production deployment.";
  const url = env.DATABASE_URL;
  if (url === undefined || url === "")
    return "DATABASE_URL isn't set. Create .env.local with node scripts/env-init.mjs.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "DATABASE_URL isn't a valid connection string.";
  }
  const override = HOST_OVERRIDES.find((name) => parsed.searchParams.has(name));
  if (override !== undefined) {
    return `DATABASE_URL sets "${override}" as a parameter; put the host in the URL itself.`;
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) return null;
  if (env.SEED_ALLOW_REMOTE === "1" && env.VERCEL_ENV === "preview") return null;
  return `Refusing to seed a non-local database (${parsed.hostname}). For a preview branch, set SEED_ALLOW_REMOTE=1 and VERCEL_ENV=preview.`;
}

/** The server address a local connection reports: loopback, or null over a Unix socket. */
export function isLoopbackServer(address: string | null): boolean {
  return address === null || address === "127.0.0.1" || address === "::1";
}
