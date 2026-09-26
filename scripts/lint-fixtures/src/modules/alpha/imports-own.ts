// Allowed: a module importing itself.
import { alphaLocal } from "@/modules/alpha/local";

export const alphaOwn = alphaLocal + 1;
