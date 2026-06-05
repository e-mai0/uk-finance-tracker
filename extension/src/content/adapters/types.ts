export type AtsKind = "GREENHOUSE" | "LEVER" | "ASHBY" | "WORKDAY" | "OTHER";

export interface AtsAdapter {
  kind: AtsKind;
  /** Whether this adapter handles the given hostname. */
  matches(host: string): boolean;
  /** The application form container, or null if this isn't an application page. */
  formContainer(): ParentNode | null;
  /** Best-effort employer + role for application tracking. */
  employerRole(): { employer?: string; role?: string };
}
