import { describe, expect, it } from "vitest";
import { describeError } from "../ingestion/adapters/common";

describe("describeError", () => {
  it("returns the plain message when there is no cause", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("unwraps an Error cause so undici's generic 'fetch failed' shows the reason", () => {
    const err = new TypeError("fetch failed");
    (err as { cause?: unknown }).cause = new Error(
      "Response does not match the HTTP/1.1 protocol (Content-Length can't be present with Transfer-Encoding)",
    );
    expect(describeError(err)).toBe(
      "fetch failed (cause: Response does not match the HTTP/1.1 protocol (Content-Length can't be present with Transfer-Encoding))",
    );
  });

  it("includes a network error code from the cause when present", () => {
    const err = new TypeError("fetch failed");
    const cause = new Error("read ECONNRESET");
    (cause as { code?: string }).code = "ECONNRESET";
    (err as { cause?: unknown }).cause = cause;
    expect(describeError(err)).toBe("fetch failed (cause: ECONNRESET read ECONNRESET)");
  });

  it("stringifies a non-Error value", () => {
    expect(describeError("nope")).toBe("nope");
  });
});
