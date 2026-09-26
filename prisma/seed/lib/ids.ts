/**
 * Deterministic seed ids (data-model §10.1): "cseed" + a four-letter entity code + a zero-padded
 * sequence, 25 lower-case alphanumerics in all (a valid cuid shape), for example
 * "cseedcomp0000000000000001". Every run writes the same ids, so re-seeding updates in place.
 */

const PREFIX = "cseed";
const LENGTH = 25;

export type SeedCode =
  | "user"
  | "tmpr"
  | "comp"
  | "csrc"
  | "cont"
  | "note"
  | "audl"
  | "noti"
  | "npre"
  | "emld"
  | "aicl"
  | "prmv"
  | "jobr"
  | "devt"
  | "whev"
  | "idem"
  | "pusg"
  | "file"
  | "svvw"
  | "prof"
  | "svsr"
  | "srun"
  | "sign"
  | "lead"
  | "levt"
  | "audt"
  | "achk"
  | "afnd"
  | "acch"
  | "scrv"
  | "xsel"
  | "lcap"
  | "sequ"
  | "sstp"
  | "enrl"
  | "mesg"
  | "mcit"
  | "matt"
  | "utok"
  | "sett"
  | "sdom"
  | "mbox"
  | "mdst"
  | "msyn"
  | "trev"
  | "rply"
  | "rcor"
  | "ithr"
  | "supp"
  | "cons"
  | "dsrq"
  | "meet"
  | "prop"
  | "pitm"
  | "deal"
  | "hoff"
  | "hasg";

export function seedId(code: SeedCode, n: number): string {
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`Seed sequence must be a positive integer, not ${String(n)}.`);
  const digits = String(n).padStart(LENGTH - PREFIX.length - code.length, "0");
  if (digits.length !== LENGTH - PREFIX.length - code.length)
    throw new Error(`Seed sequence ${String(n)} is too large.`);
  return `${PREFIX}${code}${digits}`;
}
