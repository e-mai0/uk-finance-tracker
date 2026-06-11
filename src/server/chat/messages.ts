import type { UIMessage } from "ai";

/**
 * Map a raw ChatMessage DB row to a UIMessage.
 * Used in both the chat page (server component) and the chat API route.
 */
export function rowToUIMessage(row: {
  id: string;
  clientId: string | null;
  role: string;
  parts: string;
}): UIMessage {
  let parts: UIMessage["parts"] = [];
  try {
    parts = JSON.parse(row.parts) as UIMessage["parts"];
  } catch {
    parts = [{ type: "text", text: "" }];
  }
  return {
    id: row.clientId ?? row.id,
    role: row.role as UIMessage["role"],
    parts,
  };
}

/**
 * Map a list of ChatMessage rows to UIMessage[] — the exact parsing the chat
 * page does for `initialMessages`. Aborted messages are kept as-is: the API
 * route persists their partial parts, and malformed `parts` JSON falls back
 * to an empty text part via rowToUIMessage.
 */
export function toUIMessages(
  rows: { id: string; clientId?: string | null; role: string; parts: string }[],
): UIMessage[] {
  return rows.map((row) =>
    rowToUIMessage({ ...row, clientId: row.clientId ?? null }),
  );
}
