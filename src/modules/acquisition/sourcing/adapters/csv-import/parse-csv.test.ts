import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "./parse-csv";

describe("parseCsv (RFC 4180)", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas and newlines inside quoted fields", () => {
    expect(parseCsv('name,note\n"Acme, Ltd","line1\nline2"')).toEqual([
      ["name", "note"],
      ["Acme, Ltd", "line1\nline2"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([["a"], ['She said "hi"']]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty trailing fields", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("round-trips through toCsv, quoting only where needed", () => {
    const rows = [
      ["name", "note"],
      ["Acme, Ltd", 'has "quotes"'],
      ["Plain", "simple"],
    ];
    expect(toCsv(rows)).toBe('name,note\r\n"Acme, Ltd","has ""quotes"""\r\nPlain,simple');
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
