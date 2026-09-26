/**
 * P2-AC2: every entity, field, type, nullability and default in docs/specs/data-model.md §3 and
 * §5 exists in prisma/schema/*.prisma. The documents and the schema are compared directly, so
 * any drift between them fails this test.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const dataModel = readFileSync(join(ROOT, "docs/specs/data-model.md"), "utf8");
const schema = readdirSync(join(ROOT, "prisma/schema"))
  .filter((file) => file.endsWith(".prisma"))
  .map((file) => readFileSync(join(ROOT, "prisma/schema", file), "utf8"))
  .join("\n");

/** Fields Phase 2 added beyond the data model, each recorded in phases/02/REQUESTS.md. */
const ADDED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  LeadEvent: ["actorLabel"],
};

interface SchemaField {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  attrs: string;
}

/** The `enum` and `model` blocks of the schema: each ends at a line holding only "}". */
function blocks(kind: "enum" | "model") {
  const found: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of schema.split("\n")) {
    const start = new RegExp(`^${kind} (\\w+) \\{`).exec(line);
    if (start) current = { name: start[1] ?? "", lines: [] };
    else if (current && line.trim() === "}") {
      found.push(current);
      current = null;
    } else if (current) current.lines.push(line.replace(/\/\/.*$/, "").trim());
  }
  return found;
}

function parseSchema() {
  const enums = new Map(blocks("enum").map(({ name, lines }) => [name, lines.filter(Boolean)]));
  const models = new Map<string, { table: string | null; fields: Map<string, SchemaField> }>();
  for (const { name, lines } of blocks("model")) {
    const fields = new Map<string, SchemaField>();
    let table: string | null = null;
    for (const line of lines) {
      const mapped = /^@@map\("([^"]+)"\)/.exec(line);
      if (mapped) table = mapped[1] ?? null;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!field || line.startsWith("@@")) continue;
      const [, fieldName = "", type = "", list, optional, attrs = ""] = field;
      fields.set(fieldName, {
        name: fieldName,
        type,
        list: list === "[]",
        optional: optional === "?",
        attrs,
      });
    }
    models.set(name, { table, fields });
  }
  return { enums, models };
}

/** Indexes declared for one model: @@index/@@unique blocks and field-level @unique. */
function schemaIndexes(modelName: string) {
  const model = blocks("model").find((block) => block.name === modelName);
  const indexes: { columns: string[]; unique: boolean; partial: boolean }[] = [];
  for (const line of model?.lines ?? []) {
    const block = /^@@(index|unique)\(\[([^\]]*)\]/.exec(line);
    if (block) {
      indexes.push({
        columns: (block[2] ?? "").split(",").map((column) => column.trim().replace(/\(.*$/, "")),
        unique: block[1] === "unique",
        partial: line.includes("where:"),
      });
      continue;
    }
    const field = /^(\w+)\s.*@(unique|id)\b/.exec(line);
    if (field) indexes.push({ columns: [field[1] ?? ""], unique: true, partial: false });
  }
  return indexes;
}

interface DocField {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string;
}

function parseDataModel() {
  const enumSection = dataModel.split("## 3. Enums")[1]?.split("\n## 4.")[0] ?? "";
  const enums = new Map<string, string[]>();
  for (const match of enumSection.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)) {
    enums.set(
      match[1] ?? "",
      (match[2] ?? "").split(",").map((value) => value.trim()),
    );
  }
  const entitySection = dataModel.split("## 5. Entities")[1]?.split("\n## 6.")[0] ?? "";
  const entities = new Map<string, { table: string; fields: DocField[] }>();
  for (const block of entitySection.split(/^#### /m).slice(1)) {
    const header = /^(\w+) → `([^`]+)`/.exec(block);
    if (!header) continue;
    const fields: DocField[] = [];
    for (const row of block.matchAll(/^\| (\w+) \| ([^|]+) \| (no|yes) \| ([^|]*) \|/gm)) {
      fields.push({
        name: row[1] ?? "",
        type: (row[2] ?? "").trim(),
        nullable: row[3] === "yes",
        defaultValue: (row[4] ?? "").trim(),
      });
    }
    entities.set(header[1] ?? "", { table: header[2] ?? "", fields });
  }
  return { enums, entities };
}

const prisma = parseSchema();
const doc = parseDataModel();

describe("the Prisma schema matches docs/specs/data-model.md", () => {
  it("defines every enum with exactly the documented values, in order", () => {
    expect(doc.enums.size).toBe(70);
    for (const [name, values] of doc.enums) expect(prisma.enums.get(name), name).toEqual(values);
    expect([...prisma.enums.keys()].sort()).toEqual([...doc.enums.keys()].sort());
  });

  it("has one model per entity, mapped to the documented table", () => {
    expect(doc.entities.size).toBe(63);
    for (const [name, entity] of doc.entities) {
      expect(prisma.models.get(name)?.table, name).toBe(entity.table);
    }
    expect(prisma.models.size).toBe(doc.entities.size);
  });

  it("has every documented field with its type, nullability and default", () => {
    const problems: string[] = [];
    for (const [modelName, entity] of doc.entities) {
      const model = prisma.models.get(modelName);
      if (!model) continue;
      for (const field of entity.fields) {
        const actual = model.fields.get(field.name);
        const where = `${modelName}.${field.name}`;
        if (!actual) {
          problems.push(`${where} is missing`);
          continue;
        }
        const docType = field.type.replace(/\s*\(citext\)/, "");
        const expectedType = docType === "Date" ? "DateTime" : docType.replace("[]", "");
        if (actual.type !== expectedType)
          problems.push(`${where}: type ${actual.type}, documented ${docType}`);
        if (actual.list !== docType.endsWith("[]")) problems.push(`${where}: list mismatch`);
        if (field.type.includes("(citext)") && !actual.attrs.includes("@db.Citext"))
          problems.push(`${where}: expected @db.Citext`);
        if (docType === "Date" && !actual.attrs.includes("@db.Date"))
          problems.push(`${where}: expected @db.Date`);
        if (docType === "DateTime" && !actual.attrs.includes("@db.Timestamptz(3)"))
          problems.push(`${where}: expected @db.Timestamptz(3)`);
        if (actual.optional !== field.nullable) problems.push(`${where}: nullability differs`);
        const hasDefault = /@default\(|@updatedAt/.test(actual.attrs);
        if ((field.defaultValue !== "—") !== hasDefault) problems.push(`${where}: default differs`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("has every documented index and unique constraint (partial ones with their predicate)", () => {
    const problems: string[] = [];
    const entitySection = dataModel.split("## 5. Entities")[1]?.split("\n## 6.")[0] ?? "";
    for (const block of entitySection.split(/^#### /m).slice(1)) {
      const modelName = /^(\w+) →/.exec(block)?.[1] ?? "";
      const indexLine = /^- \*\*Indexes:\*\* (.*)$/m.exec(block)?.[1] ?? "";
      const declared = schemaIndexes(modelName);
      for (const part of indexLine.split(/;\s*/)) {
        const columns = [
          ...(/\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(part)?.[1] ?? "").matchAll(/`(\w+)/g),
        ].map((match) => match[1] ?? "");
        if (columns.length === 0) continue;
        const unique = /unique/i.test(part);
        const partial = /partial|WHERE/.test(part);
        // Settings: the COALESCE expression index is two partial uniques (REQUESTS.md).
        if (modelName === "Setting" && unique) continue;
        const match = declared.find(
          (index) =>
            index.columns.join() === columns.join() &&
            (!unique || index.unique) &&
            (!partial || index.partial),
        );
        if (!match) problems.push(`${modelName}: ${part.trim()}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every model createdAt/updatedAt and adds only the recorded extra fields", () => {
    const problems: string[] = [];
    for (const [modelName, model] of prisma.models) {
      const created = model.fields.get("createdAt");
      const updated = model.fields.get("updatedAt");
      if (!created?.attrs.includes("@default(now())")) problems.push(`${modelName}.createdAt`);
      if (!updated?.attrs.includes("@updatedAt")) problems.push(`${modelName}.updatedAt`);
      const documented = new Set(doc.entities.get(modelName)?.fields.map((field) => field.name));
      for (const field of model.fields.values()) {
        const isScalar = prisma.enums.has(field.type) || !prisma.models.has(field.type);
        const known =
          !isScalar ||
          documented.has(field.name) ||
          ["createdAt", "updatedAt"].includes(field.name) ||
          (ADDED_FIELDS[modelName] ?? []).includes(field.name);
        if (!known) problems.push(`${modelName}.${field.name} isn't in the data model`);
      }
    }
    expect(problems).toEqual([]);
  });
});
