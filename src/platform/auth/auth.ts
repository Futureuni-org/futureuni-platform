/**
 * The Better Auth instance (ADR-013, docs/specs/platform.md §7).
 *
 * Design choices tied to this repository:
 *   - `disableSignUp: true` — invite-only. `acceptInvite` in `invites.ts` is the only path to a
 *     new user, and it writes User + Account + TeamProfile directly in one transaction.
 *   - Prisma adapter over the existing schema (Better Auth's default model names match ours).
 *   - The `twoFactor()` plugin issues TOTP secrets and backup codes. Admins are forced into
 *     `/setup-2fa` by the auth pages when `mustSetUp2fa` is true; the enforcement lives in
 *     server actions, not here, so a stale token can't bypass it.
 *   - The `admin()` plugin declares `banned/banReason/banExpires` on User (already in the
 *     schema) so a deactivated user's sign-in is rejected by the library too. We revoke sessions
 *     ourselves in users.ts on role/status changes for defence in depth.
 *   - `nextCookies()` must be the last plugin.
 *   - Password hashing keeps Better Auth's default scrypt. Overriding to argon2id is a
 *     REQUESTS.md item that Phase 6 or later may pick up.
 *   - Password reset email is sent through `SEAM-AUTH-EMAIL`.
 *   - Rate limiting for auth endpoints uses the database limiter (`rate_limits` table).
 */

import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, twoFactor } from "better-auth/plugins";

import { env } from "@/env";
import { db } from "@/platform/db";
import { sendEmail } from "@/platform/notifications";

const ALLOWED_GOOGLE_DOMAINS = (process.env.AUTH_GOOGLE_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain.length > 0);

function isGoogleDomainAllowed(email: string | null | undefined): boolean {
  if (email === null || email === undefined) return false;
  if (ALLOWED_GOOGLE_DOMAINS.length === 0) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return ALLOWED_GOOGLE_DOMAINS.includes(email.slice(at + 1).toLowerCase());
}

const socialProviders =
  env.AUTH_GOOGLE_ENABLED &&
  env.GOOGLE_OAUTH_CLIENT_ID !== undefined &&
  env.GOOGLE_OAUTH_CLIENT_SECRET !== undefined
    ? {
        google: {
          clientId: env.GOOGLE_OAUTH_CLIENT_ID,
          clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          mapProfileToUser: (profile: { email?: string; name?: string; picture?: string }) => {
            if (!isGoogleDomainAllowed(profile.email)) {
              throw new Error("Google sign-in restricted to an allow-listed domain");
            }
            return {};
          },
        },
      }
    : undefined;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string }; url: string }) => {
      await sendEmail({
        template: "password-reset",
        to: user.email,
        props: {
          name: user.name ?? user.email.split("@")[0] ?? "there",
          resetUrl: url,
          expiresInMinutes: 30,
        },
      });
    },
  },
  ...(socialProviders === undefined ? {} : { socialProviders }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookies: {
      session_token: {
        attributes: {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
      "/forget-password": { window: 60 * 60, max: 5 },
      "/reset-password": { window: 60 * 60, max: 5 },
    },
  },
  user: {
    additionalFields: {
      status: { type: "string", defaultValue: "ACTIVE", input: false },
      mustSetUp2fa: { type: "boolean", defaultValue: false, input: false },
    },
  },
  plugins: [
    twoFactor({
      issuer: "FUTUREUNI",
      backupCodeOptions: { amount: 10, length: 10 },
      totpOptions: { period: 30, digits: 6 },
      // Trusted devices skip the code challenge; the window refreshes on each sign-in.
      trustDeviceMaxAge: 60 * 60 * 24 * 30,
    }),
    adminPlugin({ defaultRole: "MEMBER", adminRoles: ["ADMIN"] }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
