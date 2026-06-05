import type { AtsAdapter } from "./types";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { workday } from "./workday";
import { generic } from "./generic";

const ADAPTERS: AtsAdapter[] = [greenhouse, lever, ashby, workday];

/** Pick the adapter for the current host (generic as a last resort). */
export function pickAdapter(host = window.location.hostname): AtsAdapter {
  return ADAPTERS.find((a) => a.matches(host)) ?? generic;
}

export type { AtsAdapter } from "./types";
