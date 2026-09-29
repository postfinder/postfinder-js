import { describe, expect, it, vi } from "vitest";

import { DEFAULT_BASE_URL, PostFinder } from "./index";

/**
 * The controls that stop this client being turned against its caller.
 *
 * There is no key to leak: the API is keyless. What passes through instead is
 * what a person typed into a search box, which in a location product is
 * routinely their own address, and the URLs this client builds out of whatever a
 * caller hands it. So: the destination cannot be moved off https, a slug cannot
 * walk out of its path prefix, nothing reaches a header or a query unencoded,
 * and a page's cookies never ride along.
 */

function recorder(body: unknown = { data: [] }, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  });
  return {
    calls,
    fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    get url() {
      return calls[calls.length - 1]!.url;
    },
    get init() {
      return calls[calls.length - 1]!.init!;
    },
  };
}

describe("where requests may go", () => {
  it("defaults to https", () => {
    expect(DEFAULT_BASE_URL.startsWith("https://")).toBe(true);
  });

  it("refuses plaintext http to a public host", () => {
    expect(() => new PostFinder({ baseUrl: "http://api.postfinder.io" })).toThrow(/clear/);
  });

  it("allows loopback over http, for a test server", () => {
    for (const baseUrl of ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"]) {
      expect(() => new PostFinder({ baseUrl })).not.toThrow();
    }
  });

  it("refuses another scheme", () => {
    for (const baseUrl of ["ftp://api.postfinder.io", "file:///etc/passwd", "javascript:alert(1)"]) {
      expect(() => new PostFinder({ baseUrl })).toThrow();
    }
  });

  it("refuses a base URL that is not absolute", () => {
    for (const baseUrl of ["", "api.postfinder.io", "/v1"]) {
      expect(() => new PostFinder({ baseUrl })).toThrow();
    }
  });

  it("refuses a base URL carrying credentials", () => {
    // https://api.postfinder.io:pass@evil.example reads as the real host to
    // anyone skimming a config file, and is a different host to the runtime.
    expect(() => new PostFinder({ baseUrl: "https://api.postfinder.io:pass@evil.example" })).toThrow(
      /credentials/,
    );
  });
});

describe("what reaches the wire", () => {
  it("does not let a slug walk out of its path prefix", async () => {
    const rec = recorder({ data: {} });
    const pf = new PostFinder({ fetch: rec.fetchImpl });

    await pf.country("../../v1/keys");
    expect(rec.url).not.toContain("/v1/keys");
    expect(rec.url).toContain("..%2F..%2Fv1%2Fkeys");

    await pf.locality("australia", "victoria", "../../../v1/addresses");
    expect(rec.url).not.toContain("/v1/addresses");
  });

  it("does not let a slug smuggle a query string", async () => {
    const rec = recorder({ data: {} });
    await new PostFinder({ fetch: rec.fetchImpl }).country("australia?limit=9999");

    expect(rec.url).not.toContain("?");
  });

  it("refuses an empty slug rather than calling a broader endpoint", async () => {
    const rec = recorder();
    const pf = new PostFinder({ fetch: rec.fetchImpl });

    await expect(pf.country("")).rejects.toThrow();
    await expect(pf.locality("australia", "", "coburg")).rejects.toThrow();
    await expect(pf.place("  ")).rejects.toThrow();
    expect(rec.calls).toEqual([]);
  });

  it("does not let a query inject another parameter", async () => {
    const rec = recorder();
    await new PostFinder({ fetch: rec.fetchImpl }).search("coburg&limit=9999&country=x");

    expect(rec.url).toContain("q=coburg%26limit%3D9999%26country%3Dx");
    expect(rec.url).not.toContain("&limit=9999");
  });

  it("does not let a query carry a newline into the request", async () => {
    const rec = recorder();
    await new PostFinder({ fetch: rec.fetchImpl }).search("coburg\r\nX-Injected: 1");

    expect(rec.url).not.toMatch(/[\r\n]/);
  });

  it("refuses a contact with a newline in it", () => {
    expect(() => new PostFinder({ contact: "https://example.com\r\nAuthorization: Bearer x" })).toThrow();
  });

  it("refuses a limit that is not a number, rather than sending the word NaN", async () => {
    const rec = recorder();
    const pf = new PostFinder({ fetch: rec.fetchImpl });

    await expect(pf.search("coburg", { limit: NaN })).rejects.toThrow();
    await expect(pf.search("coburg", { limit: Infinity })).rejects.toThrow();
    await expect(pf.search("coburg", { limit: -5 })).rejects.toThrow();
    await expect(pf.region("australia", "victoria", { offset: NaN })).rejects.toThrow();
    expect(rec.calls).toEqual([]);
  });

  it("sends no credential header and no cookies", async () => {
    // credentials omit, so a page's session cookie for the API's domain never
    // rides along with a keyless read. Nothing here is authenticated, and a
    // cookie on a cacheable GET is how a shared cache learns something it
    // should not hold.
    const rec = recorder();
    await new PostFinder({ fetch: rec.fetchImpl }).search("coburg");

    const headers = new Headers(rec.init.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Cookie")).toBeNull();
    expect(rec.init.credentials).toBe("omit");
  });
});

describe("what comes back", () => {
  it("survives a body that is not an object", async () => {
    for (const raw of ["[1,2,3]", '"gotcha"', "null", "", "{"]) {
      const fetchImpl = (async () => new Response(raw, { status: 200 })) as unknown as typeof globalThis.fetch;
      await expect(new PostFinder({ fetch: fetchImpl }).search("coburg")).resolves.toEqual([]);
    }
  });

  it("does not trust a problem document to decide whether it failed", async () => {
    // A 500 carrying a cheerful body is still a 500: the status decides.
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ name: "surprise" }] }), { status: 500 })) as unknown as typeof globalThis.fetch;

    await expect(new PostFinder({ fetch: fetchImpl }).search("coburg")).rejects.toMatchObject({ status: 500 });
  });
});
