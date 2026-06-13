// Shared state shape for the Firm Scout action. Kept out of the server-action
// file (sources.ts) because a server-action module may only export async
// functions — a runtime constant like SCOUT_IDLE would break every action.
export interface ScoutState {
  ok: boolean;
  message: string;
}

export const SCOUT_IDLE: ScoutState = { ok: true, message: "" };
