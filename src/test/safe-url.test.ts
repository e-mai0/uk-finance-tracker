import { describe, expect, it } from "vitest";
import { safePublicUrl } from "../lib/source-detect";

describe("safePublicUrl", () => {
  it("accepts public https careers URLs (and adds the scheme when missing)", () => {
    expect(safePublicUrl("https://www.citadel.com/careers/")?.hostname).toBe(
      "www.citadel.com",
    );
    expect(safePublicUrl("careers.example.com/jobs")?.protocol).toBe("https:");
  });

  it("rejects loopback, private and link-local hosts", () => {
    for (const u of [
      "http://localhost/admin",
      "http://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.1/x",
      "https://172.16.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://internal-api.internal/x",
      "https://db.local/x",
      "https://[::1]/x",
    ]) {
      expect(safePublicUrl(u)).toBeNull();
    }
  });

  it("rejects non-http protocols, credentials, odd ports and bare hosts", () => {
    expect(safePublicUrl("ftp://example.com/x")).toBeNull();
    expect(safePublicUrl("https://user:pass@example.com/x")).toBeNull();
    expect(safePublicUrl("https://example.com:8080/x")).toBeNull();
    expect(safePublicUrl("https://intranethost/x")).toBeNull();
    expect(safePublicUrl("not a url %%%")).toBeNull();
  });
});
