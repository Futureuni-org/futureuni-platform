import { describe, expect, it } from "vitest";

import { generatedSecrets, renderEnvLocal } from "../env-init.mjs";
import { parseEnvText, setEnvValues } from "./env-file.mjs";

describe("setEnvValues", () => {
  const text = ["# App", 'PORT="3000"', '# MOCKS="false"', 'MOCKS="true"', ""].join("\n");

  it("replaces assigned keys in place and keeps comments", () => {
    const next = setEnvValues(text, { PORT: 3005, MOCKS: "false" });
    expect(next).toBe(["# App", 'PORT="3005"', '# MOCKS="false"', 'MOCKS="false"', ""].join("\n"));
  });

  it("appends keys that aren't assigned yet", () => {
    expect(
      parseEnvText(setEnvValues(text, { DATABASE_URL: "postgresql://localhost/x" })),
    ).toMatchObject({
      PORT: "3000",
      DATABASE_URL: "postgresql://localhost/x",
    });
  });

  it("keeps Windows line endings", () => {
    expect(setEnvValues('A="1"\r\nB="2"\r\n', { B: "3" })).toBe('A="1"\r\nB="3"\r\n');
  });

  it("refuses values that would break the file", () => {
    expect(() => setEnvValues(text, { PORT: 'x"y' })).toThrow(/PORT/);
  });
});

describe("env-init", () => {
  const example = [
    'CREDENTIALS_ENCRYPTION_KEY="REPLACE_WITH_32_BYTE_BASE64_KEY"',
    'CRON_SECRET="REPLACE_WITH_RANDOM_SECRET"',
    'MOCKS="true"',
    "",
  ].join("\n");

  it("fills only the placeholders, with values long enough for src/env.ts", () => {
    const secrets = generatedSecrets(example);
    expect(Object.keys(secrets).sort()).toEqual(["CREDENTIALS_ENCRYPTION_KEY", "CRON_SECRET"]);
    expect(Buffer.from(secrets.CREDENTIALS_ENCRYPTION_KEY ?? "", "base64")).toHaveLength(32);
    expect((secrets.CRON_SECRET ?? "").length).toBeGreaterThanOrEqual(32);
  });

  it("writes a file with no placeholders left", () => {
    const rendered = renderEnvLocal(example);
    expect(rendered).not.toContain("REPLACE_WITH");
    expect(parseEnvText(rendered).MOCKS).toBe("true");
  });
});
