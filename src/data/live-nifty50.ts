import type { Fundamentals } from "../types/index.js";
import { getNifty500Fundamentals } from "./nifty500.js";

export async function getLiveNifty50Fundamentals(force = false): Promise<Fundamentals[]> {
  return getNifty500Fundamentals(force);
}

export function mergeFundamentals(live: Fundamentals[]): Fundamentals[] {
  return live;
}
