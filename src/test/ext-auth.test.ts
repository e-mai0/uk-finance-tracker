/**
 * Security tests for the extension's bearer-token auth — `src/server/ext-auth.ts`.
 *
 * These `trk_` tokens are the app's only user-facing "API key": they
 * authenticate every `/api/ext/*` route cross-origin, where the NextAuth
 * session cookie can't reach. Until now the token-verification logic had ZERO
 * direct coverage — every route test mocks `requireToken` away — so the
 * security-critical path (prefix gating, hash-only lookup, revocation,
 * constant-time compare, plaintext-never-stored) was untested.
 *
 * The threat model these tests pin down ("abusing API keys"):
 *   1. An attacker presenting a forged/guessed/garbage Authorization header
 *      must NOT authenticate, and must NOT trigger needless DB work.
 *   2. A revoked token must stop working immediately, even though its hash is
 *      still findable.
 *   3. The plaintext token must NEVER be written to or queried from the DB —
 *      only its SHA-256 hash is persisted (DB compromise ⇏ usable tokens).
 *   4. The hash compared on the hot path must be constant-time and must reject
 *      any record whose stored hash doesn't match (defence in depth).
 *
 * We run the REAL crypto (hashToken/generateToken/timingSafeEqual) and mock
 * only `@/server/db`, mirroring application-record.test.ts's harness so the
 * `server-only` guard doesn't throw under the vitest node env.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// --- Hoist prisma mocks so the vi.mock factory can close over them ----------
const { findUnique, update, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  // requireToken fires a best-effort, un-awaited lastUsedAt stamp; it must
  // return a thenable or the trailing `.catch()` throws.
  update: vi.fn(async () => ({})),
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  prisma: {
    apiToken: { findUnique, update, create },
  },
}));

import {
  requireToken,
  hashToken,
  generateToken,
  mintToken,
} from "@/server/ext-auth";

const TOKEN_PREFIX = "trk_";

/** Build a request carrying the given raw Authorization header value. */
function reqWithAuth(authHeader: string | null): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== null) headers.Authorization = authHeader;
  return new Request("http://localhost/api/ext/profile", { method: "GET", headers });
}

/** Build a request with `Authorization: Bearer <token>`. */
function reqWithBearer(token: string): Request {
  return reqWithAuth(`Bearer ${token}`);
}

/** A DB row as `findUnique` would return it, hash derived from the plaintext. */
function tokenRow(plain: string, over: Partial<{ id: string; userId: string; revokedAt: Date | null }> = {}) {
  return {
    id: over.id ?? "tok_1",
    userId: over.userId ?? "user_1",
    tokenHash: hashToken(plain),
    revokedAt: over.revokedAt ?? null,
  };
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset().mockImplementation(async () => ({}));
  create.mockReset();
});

// ---------------------------------------------------------------------------
// hashToken — tokens are stored hashed, never in plaintext
// ---------------------------------------------------------------------------
describe("hashToken", () => {
  it("is a deterministic SHA-256 hex digest of the input", () => {
    const plain = "trk_deadbeef";
    const expected = createHash("sha256").update(plain).digest("hex");
    expect(hashToken(plain)).toBe(expected);
    expect(hashToken(plain)).toBe(hashToken(plain)); // deterministic
  });

  it("never returns the plaintext and yields a 64-char hex string", () => {
    const plain = generateToken();
    const hash = hashToken(plain);
    expect(hash).not.toBe(plain);
    expect(hash).not.toContain(plain);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is collision-resistant for distinct inputs (different token → different hash)", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });
});

// ---------------------------------------------------------------------------
// generateToken — opaque, prefixed, high-entropy, unguessable
// ---------------------------------------------------------------------------
describe("generateToken", () => {
  it("carries the trk_ prefix and 24 bytes (48 hex chars) of entropy", () => {
    const t = generateToken();
    expect(t.startsWith(TOKEN_PREFIX)).toBe(true);
    const body = t.slice(TOKEN_PREFIX.length);
    expect(body).toMatch(/^[0-9a-f]{48}$/);
  });

  it("produces unique tokens across many draws (no static/predictable value)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// requireToken — reject everything that isn't a live, valid trk_ token
// ---------------------------------------------------------------------------
describe("requireToken — rejection paths", () => {
  it("rejects a request with no Authorization header, without touching the DB", async () => {
    expect(await requireToken(reqWithAuth(null))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-Bearer scheme (e.g. Basic), without touching the DB", async () => {
    expect(await requireToken(reqWithAuth("Basic trk_abc"))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a Bearer header with an empty value", async () => {
    expect(await requireToken(reqWithAuth("Bearer "))).toBeNull();
    expect(await requireToken(reqWithAuth("Bearer"))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a well-formed Bearer token that lacks the trk_ prefix WITHOUT hitting the DB", async () => {
    // Prefix gating is a cheap pre-filter: arbitrary attacker input must not
    // even reach a Prisma lookup.
    expect(await requireToken(reqWithBearer("sk_live_not_ours"))).toBeNull();
    expect(await requireToken(reqWithBearer("abcdef"))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a trk_-prefixed token that is not in the DB (unknown/guessed token)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await requireToken(reqWithBearer("trk_unknown"))).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
    // No usage stamp written for a token that didn't resolve.
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a revoked token even though its hash is still found", async () => {
    const plain = "trk_revoked";
    findUnique.mockResolvedValue(tokenRow(plain, { revokedAt: new Date("2025-01-01") }));
    expect(await requireToken(reqWithBearer(plain))).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a record whose stored hash does not match the presented token (constant-time guard)", async () => {
    // Defence in depth: even if a row were returned for the wrong key, the
    // timingSafeEqual compare must reject a mismatched hash.
    findUnique.mockResolvedValue({
      id: "tok_x",
      userId: "user_x",
      tokenHash: hashToken("trk_some_other_token"),
      revokedAt: null,
    });
    expect(await requireToken(reqWithBearer("trk_presented"))).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("requireToken — happy path & invariants", () => {
  it("authenticates a valid, non-revoked token and returns its userId", async () => {
    const plain = "trk_goodtoken";
    findUnique.mockResolvedValue(tokenRow(plain, { userId: "user_42" }));
    const auth = await requireToken(reqWithBearer(plain));
    expect(auth).toEqual({ userId: "user_42" });
  });

  it("looks the token up by its HASH, never by the plaintext (DB stores only the hash)", async () => {
    const plain = "trk_secretvalue";
    findUnique.mockResolvedValue(tokenRow(plain));
    await requireToken(reqWithBearer(plain));

    expect(findUnique).toHaveBeenCalledTimes(1);
    const arg = findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ tokenHash: hashToken(plain) });
    // The raw secret must appear nowhere in the query (no plaintext lookup).
    expect(JSON.stringify(arg)).not.toContain(plain);
  });

  it("stamps lastUsedAt best-effort for the resolved token (keyed by row id)", async () => {
    const plain = "trk_stampme";
    findUnique.mockResolvedValue(tokenRow(plain, { id: "tok_99" }));
    await requireToken(reqWithBearer(plain));

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "tok_99" });
    expect(arg.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it("still authenticates when the best-effort lastUsedAt stamp rejects (non-blocking)", async () => {
    const plain = "trk_stampfails";
    findUnique.mockResolvedValue(tokenRow(plain, { userId: "user_7" }));
    update.mockRejectedValueOnce(new Error("db write failed"));
    // Must not throw or reject — the usage stamp is fire-and-forget.
    await expect(requireToken(reqWithBearer(plain))).resolves.toEqual({ userId: "user_7" });
  });

  it("trims stray trailing whitespace on the bearer value before hashing", async () => {
    // extractBearer() runs `.trim()` on the captured value, so a token with a
    // trailing newline (e.g. a copy-paste artefact) still resolves to the same
    // hash as the clean token.
    const plain = "trk_trimme";
    findUnique.mockResolvedValue(tokenRow(plain));
    const auth = await requireToken(reqWithAuth(`Bearer ${plain}\n`));
    expect(auth).toEqual({ userId: "user_1" });
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashToken(plain) });
  });

  it("accepts a case-insensitive Bearer scheme", async () => {
    const plain = "trk_caseless";
    findUnique.mockResolvedValue(tokenRow(plain));
    expect(await requireToken(reqWithAuth(`bearer ${plain}`))).toEqual({ userId: "user_1" });
    expect(await requireToken(reqWithAuth(`BEARER ${plain}`))).toEqual({ userId: "user_1" });
  });
});

// ---------------------------------------------------------------------------
// mintToken — issues plaintext to the caller, persists only the hash
// ---------------------------------------------------------------------------
describe("mintToken", () => {
  it("returns a trk_ plaintext but writes ONLY its hash to the DB", async () => {
    create.mockResolvedValue({ id: "tok_new" });
    const { id, token } = await mintToken("user_5", "My laptop");

    expect(id).toBe("tok_new");
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.userId).toBe("user_5");
    expect(data.name).toBe("My laptop");
    // Critically: the stored value is the hash, NOT the plaintext.
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toBe(token);
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain(token);
  });

  it("defaults the token name when none is given", async () => {
    create.mockResolvedValue({ id: "tok_default" });
    await mintToken("user_6");
    expect(create.mock.calls[0][0].data.name).toBe("Browser extension");
  });

  it("a freshly minted token authenticates against its own stored hash", async () => {
    // End-to-end invariant: mint → the hash persisted is exactly what
    // requireToken recomputes and looks up, so the issued plaintext works.
    create.mockResolvedValue({ id: "tok_rt" });
    const { token } = await mintToken("user_8");
    const storedHash = create.mock.calls[0][0].data.tokenHash;

    findUnique.mockResolvedValue({
      id: "tok_rt",
      userId: "user_8",
      tokenHash: storedHash,
      revokedAt: null,
    });
    expect(await requireToken(reqWithBearer(token))).toEqual({ userId: "user_8" });
  });
});
