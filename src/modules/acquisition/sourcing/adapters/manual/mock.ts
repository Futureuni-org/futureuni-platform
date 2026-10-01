import "server-only";

/** Manual add has no provider to mock; the mock is the same metadata (addManualLead drives it). */
import { defineAdapter } from "../types";
import { adapter } from "./index";

export const mockAdapter = adapter;
export default defineAdapter(adapter);
