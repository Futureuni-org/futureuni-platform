/** A simple per-lead cost meter (micro-USD). `tryCharge` refuses a charge that would exceed the cap. */

import "server-only";

export interface CostMeter {
  tryCharge(micros: number, label: string): boolean;
  spentMicros(): number;
}

export function createCostMeter(capMicros: number): CostMeter {
  let spent = 0;
  return {
    tryCharge(micros: number): boolean {
      if (micros < 0) return true;
      if (spent + micros > capMicros) return false;
      spent += micros;
      return true;
    },
    spentMicros(): number {
      return spent;
    },
  };
}
