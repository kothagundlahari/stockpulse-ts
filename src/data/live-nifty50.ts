import type { Fundamentals } from "../types/index.js";
import { getNifty500Fundamentals, mergeOverNifty500 } from "./nifty500.js";

/**
 * Compatibility shim: the live universe is now the dynamic NIFTY 500 set
 * (see nifty500.ts). These functions keep the historical signatures used by
 * the server and CLI while delegating to the dynamic implementation.
 */
export async function getLiveNifty50Fundamentals(force = false): Promise<Fundamentals[]> {
  return getNifty500Fundamentals(force);
}

export function mergeFundamentals(live: Fundamentals[]): Fundamentals[] {
  return mergeOverNifty500(live);
}
