import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cronAuthorized } from "@/server/cron";

describe("cronAuthorized", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (savedSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = savedSecret;
    }
  });

  it("returns false when CRON_SECRET is unset (fail closed)", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://x", {
      headers: { authorization: "Bearer anything" },
    });
    expect(cronAuthorized(req)).toBe(false);
  });

  it("returns false when the authorization header is missing", () => {
    process.env.CRON_SECRET = "supersecret";
    const req = new Request("http://x");
    expect(cronAuthorized(req)).toBe(false);
  });

  it("returns false on a wrong secret", () => {
    process.env.CRON_SECRET = "supersecret";
    const req = new Request("http://x", {
      headers: { authorization: "Bearer wrongsecret" },
    });
    expect(cronAuthorized(req)).toBe(false);
  });

  it("returns false when the secret is sent without the Bearer prefix", () => {
    process.env.CRON_SECRET = "supersecret";
    const req = new Request("http://x", {
      headers: { authorization: "supersecret" },
    });
    expect(cronAuthorized(req)).toBe(false);
  });

  it("returns true on exact Bearer <secret>", () => {
    process.env.CRON_SECRET = "supersecret";
    const req = new Request("http://x", {
      headers: { authorization: "Bearer supersecret" },
    });
    expect(cronAuthorized(req)).toBe(true);
  });
});
