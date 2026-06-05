import "server-only";

/**
 * Extract plain text from an uploaded CV so the copilot can ground generated
 * answers in the user's real experience. Supports PDF (via unpdf, a
 * serverless-friendly pdf.js wrapper), DOCX (via mammoth) and plain text.
 *
 * Parsing is best-effort: a failure returns an empty string rather than
 * throwing, so a malformed file never blocks the upload — the file is still
 * stored and the user can paste text manually.
 */

const MAX_CHARS = 24_000; // plenty for a CV; keeps prompt sizes sane

function tidy(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

export async function extractCvText(
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
): Promise<string> {
  const lower = fileName.toLowerCase();
  try {
    if (contentType === "application/pdf" || lower.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return tidy(Array.isArray(text) ? text.join("\n") : text);
    }
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lower.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return tidy(value);
    }
    if (contentType.startsWith("text/") || lower.endsWith(".txt")) {
      return tidy(new TextDecoder().decode(bytes));
    }
  } catch {
    // fall through to empty — upload still succeeds, user can paste text
  }
  return "";
}
