import net from "node:net";
import { describe, expect, it } from "vitest";
import { fetchTextLenient, ImpervaBlockedError } from "../ingestion/adapters/common";

/**
 * Spin up a raw TCP server that replies with `raw` (a complete, byte-exact
 * HTTP/1.1 response) to the first request, then closes. Lets us reproduce
 * server framing that a normal HTTP client can't easily be coerced into.
 */
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

// tal.net servers send BOTH Content-Length and Transfer-Encoding: chunked on the
// same response — illegal per RFC 7230, so Node's built-in fetch (undici)
// rejects it with an HTTPParserError surfaced only as "fetch failed". This is
// the exact production framing that left all tal.net sources unfetchable.
const DUAL_FRAMING =
  "HTTP/1.1 200 OK\r\n" +
  "Content-Type: text/html\r\n" +
  "Content-Length: 7\r\n" +
  "Transfer-Encoding: chunked\r\n" +
  "\r\n" +
  "7\r\nOK BODY\r\n0\r\n\r\n";

describe("fetchTextLenient", () => {
  it("reads a response that carries both Content-Length and Transfer-Encoding", async () => {
    const srv = await rawHttpServer(DUAL_FRAMING);
    try {
      // Document the bug: the standard fetch path cannot parse this at all.
      await expect(fetch(srv.url)).rejects.toThrow();
      // The lenient path tolerates the ambiguous framing and returns the body.
      const body = await fetchTextLenient(srv.url);
      expect(body).toContain("OK BODY");
    } finally {
      await srv.close();
    }
  });

  it("throws on a non-2xx status", async () => {
    const srv = await rawHttpServer("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
    try {
      await expect(fetchTextLenient(srv.url)).rejects.toThrow(/404/);
    } finally {
      await srv.close();
    }
  });

  it("throws ImpervaBlockedError on a 200-disguised interstitial", async () => {
    const body = "Request unsuccessful. Incapsula incident ID: 999";
    const srv = await rawHttpServer(
      `HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
    try {
      await expect(fetchTextLenient(srv.url)).rejects.toBeInstanceOf(ImpervaBlockedError);
    } finally {
      await srv.close();
    }
  });
});
