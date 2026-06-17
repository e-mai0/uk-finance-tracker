// src/server/chat/resume-decision.ts
export type ResumeDecision =
  | { status: 401 }
  | { status: 404 }
  | { status: 204 }
  | { status: 200; streamId: string };

/** Pure: maps auth + ownership + pointer state to an HTTP outcome. */
export function resolveResumeDecision(args: {
  userId?: string;
  session: { id: string } | null;
  activeStreamId: string | null;
}): ResumeDecision {
  if (!args.userId) return { status: 401 };
  if (!args.session) return { status: 404 };
  if (!args.activeStreamId) return { status: 204 };
  return { status: 200, streamId: args.activeStreamId };
}
