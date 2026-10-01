import "server-only";

/** CSV import has no provider to mock; the mock is the same metadata (importCsv drives the data). */
import { defineAdapter } from "../types";
import { adapter } from "./index";

export const mockAdapter = adapter;
export default defineAdapter(adapter);
