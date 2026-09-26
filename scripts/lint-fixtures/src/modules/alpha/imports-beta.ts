// Violation: a module importing another module.
import { betaValue } from "@/modules/beta/value";

export const alphaValue = betaValue + 1;
