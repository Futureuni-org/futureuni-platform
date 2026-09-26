// Small, dependency-free helpers for reading and editing .env files, shared by the scripts.
// Node 24's util.parseEnv follows the dotenv format used by Next.js.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/** The repository (or worktree) root that contains this scripts folder. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Parses .env text into a key/value object. */
export function parseEnvText(text) {
  return parseEnv(text);
}

/** Reads an .env file; a missing file reads as empty. */
export function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnvText(readFileSync(path, "utf8"));
}

const ASSIGNMENT = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function formatValue(key, value) {
  const text = String(value);
  if (/["\r\n]/.test(text))
    throw new Error(`${key}: values with quotes or line breaks aren't supported`);
  return `"${text}"`;
}

/**
 * Sets keys in .env text, keeping comments, order and every other line. A key that isn't
 * assigned yet (commented-out lines don't count) is appended at the end.
 */
export function setEnvValues(text, values) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const written = new Set();
  const out = lines.map((line) => {
    const match = ASSIGNMENT.exec(line);
    const key = match?.[2];
    if (key === undefined || !Object.hasOwn(values, key)) return line;
    written.add(key);
    return `${key}=${formatValue(key, values[key])}`;
  });
  const missing = Object.keys(values).filter((key) => !written.has(key));
  if (missing.length > 0) {
    if (out.length > 0 && out[out.length - 1] === "") out.pop();
    for (const key of missing) out.push(`${key}=${formatValue(key, values[key])}`);
    out.push("");
  }
  return out.join(newline);
}
