// Violation: a relative import that crosses into another module.
import { betaValue } from "../beta/value";

export const alphaRelative = betaValue + 1;
