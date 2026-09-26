/** Writes seed files: copies each fixture into local storage and upserts its FileObject on the key. */

import type { Tx } from "@/platform/db";

import type { SeedFile } from "../world/audits";

import { remap, without, type IdMap } from "./context";
import { copyFixture } from "./storage";

export async function writeFiles(tx: Tx, files: readonly SeedFile[], ids: IdMap): Promise<void> {
  for (const file of files) {
    copyFixture(file.fixture, file.row.key);
    const row = remap(file.row, ids);
    await tx.fileObject.upsert({
      where: { key: row.key },
      create: row,
      update: without(row, "id", "key"),
    });
  }
}
