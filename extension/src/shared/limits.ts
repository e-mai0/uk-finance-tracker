/**
 * Mirror of the server bounds in src/lib/validation.ts (fieldSchemaSchema /
 * extPlanRequestSchema). Keep in sync with that file.
 */
export const LIMITS = {
  maxFields: 200,
  maxLabel: 400,
  maxNearbyText: 600,
  maxOption: 200,
  maxOptions: 80,
  maxCharLimit: 20000,
} as const;
