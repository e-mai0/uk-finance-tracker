import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  ChallengeBlockedError,
  fetchTextLenient,
  ImpervaBlockedError,
  isChallengeBlocked,
} from "../ingestion/adapters/common";

/**
 * A faithful reproduction of the oleeoProtect / altcha "Quick Check Needed"
 * bot-challenge interstitial that four tal.net IB boards (Jefferies, Rothschild,
 * Evercore, Lazard) began serving with HTTP 200. It is a small (~3 KB) stub that
 * carries NONE of the Imperva/Incapsula tokens, so it previously passed
 * `isImpervaBlocked` as a clean body — mapTalNetBoard then found zero tiles and
 * the close-sweep silently closed those firms' roles.
 *
 * The detector must key on the challenge CLASS (oleeoProtect + altcha widget +
 * "Quick Check Needed" verification interstitial), not this literal string.
 */
const OLEEO_ALTCHA_STUB = `<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="author" content="Oleeo" />
    <title>Quick Check Needed</title>
    <script src="/oleeoProtect/altcha.min.js" defer></script>
  </head>
  <body class="oleeoProtect-challenge">
    <div class="oleeoProtect">
      <h1>Quick Check Needed</h1>
      <p>We just need to verify that you are human before you continue.</p>
      <altcha-widget
        data-challengeurl="/oleeoProtect/challenge"
        data-auto="onload"
      ></altcha-widget>
      <noscript>Please enable JavaScript to complete the verification.</noscript>
    </div>
  </body>
</html>`;

function rawHttpServer(raw: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.once("data", () => {
        socket.write(raw);
        socket.end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("isChallengeBlocked", () => {
  it("detects the oleeoProtect/altcha 'Quick Check Needed' stub", () => {
    expect(isChallengeBlocked(OLEEO_ALTCHA_STUB)).toBe(true);
  });

  it("detects a variant keyed on altcha widget + verification copy (no exact match)", () => {
    const variant = `<!DOCTYPE html><html><head><title>Verifying you are human</title></head>
      <body><altcha-widget data-challengeurl="/x/challenge"></altcha-widget>
      <p>Please complete the verification to continue.</p></body></html>`;
    expect(isChallengeBlocked(variant)).toBe(true);
  });

  it("does NOT flag a real populated tal.net board as a challenge (no false positive)", () => {
    const realBoard = `<!DOCTYPE html><html><head><title>Campus Opportunities - Jefferies</title>
      <meta name="author" content="Oleeo" /></head>
      <body><ul class="opp-list">
      <li class="opp-container"><div class="opp_1813 candidate-opp-tile" data-oppid="1813"
        data-title="2026 Equity Research Summer Internship">
        <a class="subject" href="/vx/candidate/so/pm/1/pl/2/opp/1813-2026-Equity-Research/en-GB">
        2026 Equity Research Summer Internship</a></div></li>
      </ul></body></html>`;
    // A real board carries the Oleeo author meta but NONE of the challenge
    // markers (no altcha widget, no "Quick Check Needed"); it must parse.
    expect(isChallengeBlocked(realBoard)).toBe(false);
  });

  it("does NOT flag an empty or unrelated body", () => {
    expect(isChallengeBlocked("")).toBe(false);
    expect(isChallengeBlocked("<html><body>hello world</body></html>")).toBe(false);
  });
});

describe("ChallengeBlockedError", () => {
  it("is an ImpervaBlockedError so the sync layer's existing catch marks it unreachable", () => {
    const err = new ChallengeBlockedError("challenge at x");
    expect(err).toBeInstanceOf(ImpervaBlockedError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("fetchTextLenient bot-challenge handling", () => {
  it("throws a ChallengeBlockedError on the 200-disguised oleeoProtect/altcha stub", async () => {
    const srv = await rawHttpServer(
      `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(
        OLEEO_ALTCHA_STUB,
      )}\r\n\r\n${OLEEO_ALTCHA_STUB}`,
    );
    try {
      const err = await fetchTextLenient(srv.url).then(
        () => null,
        (e) => e as unknown,
      );
      expect(err).toBeInstanceOf(ChallengeBlockedError);
      // and (since it extends ImpervaBlockedError) the sync catch still fires,
      // marking the source UNREACHABLE and skipping the close-sweep:
      expect(err).toBeInstanceOf(ImpervaBlockedError);
    } finally {
      await srv.close();
    }
  });

  it("still returns a real populated board body (no false positive over the wire)", async () => {
    const realBoard =
      `<html><head><meta name="author" content="Oleeo" /></head><body>` +
      `<div class="opp_1813 candidate-opp-tile" data-oppid="1813"></div></body></html>`;
    const srv = await rawHttpServer(
      `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(
        realBoard,
      )}\r\n\r\n${realBoard}`,
    );
    try {
      const body = await fetchTextLenient(srv.url);
      expect(body).toContain("candidate-opp-tile");
    } finally {
      await srv.close();
    }
  });
});
