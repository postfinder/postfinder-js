import { describe, expect, it, vi } from "vitest";

import {
  BadRequest,
  CATEGORIES,
  NotFound,
  PostFinder,
  PostFinderError,
  RateLimited,
  hitPath,
  localityPath,
  placePath,
  suburbsIn,
} from "./index";
import type { PostcodeIndex } from "./types";

/** The envelopes internal/domain writes, field for field. */
const SEARCH = {
  data: [
    {
      kind: "locality",
      slug: "coburg",
      name: "Coburg",
      country: "australia",
      region: "victoria",
      postcode: "3058",
      place_count: 14,
      state: "VIC",
      lat: -37.7404,
      lng: 144.9633,
      score: 0.91,
    },
    {
      kind: "place",
      slug: "coburg-post-office",
      name: "Coburg Post Office",
      country: "australia",
      region: "victoria",
      locality: "coburg",
      postcode: "3058",
      score: 0.74,
    },
  ],
  generated_at: "2026-09-29T02:11:00Z",
};

const NEARBY = {
  data: [
    {
      public_id: "k7m2p9x4",
      slug: "coburg-post-office",
      name: "Coburg Post Office",
      brand: "australia-post",
      category: "post-offices",
      address: "484 Sydney Rd",
      lat: -37.7412,
      lng: 144.9645,
      hours: { mon: "9:00-17:00" },
      country: "australia",
      region: "victoria",
      locality: "coburg",
      distance_km: 0.42,
    },
  ],
  generated_at: "2026-09-29T02:11:00Z",
};

const PLACE = {
  data: {
    country: { iso2: "AU", slug: "australia", name: "Australia" },
    region: { slug: "victoria", code: "VIC", name: "Victoria" },
    locality: { slug: "coburg", name: "Coburg", postcode: "3058", place_count: 14 },
    place: {
      public_id: "k7m2p9x4",
      slug: "coburg-post-office",
      name: "Coburg Post Office",
      brand: "australia-post",
      category: "post-offices",
      lat: -37.7412,
      lng: 144.9645,
    },
    nearby: [],
    reviews: { summary: { count: 2, average: 4.5, last_as_listed_at: null }, recent: [] },
    photos: [],
  },
  generated_at: "2026-09-29T02:11:00Z",
};

const POSTCODES = {
  data: {
    country: { iso2: "AU", slug: "australia", name: "Australia" },
    total: 3,
    regions: [
      {
        region: { slug: "victoria", code: "VIC", name: "Victoria" },
        entries: [
          { postcode: "3058", slug: "coburg", name: "Coburg", place_count: 14 },
          { postcode: "3058", slug: "merlynston", name: "Merlynston", place_count: 1 },
        ],
      },
      {
        region: { slug: "new-south-wales", code: "NSW", name: "New South Wales" },
        entries: [{ postcode: "2044", slug: "sydenham", name: "Sydenham", place_count: 3 }],
      },
    ],
  },
  generated_at: "2026-09-29T02:11:00Z",
};

/** A fetch that records what it was asked and answers with one canned body. */
function recorder(body: unknown = SEARCH, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
    });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch, get url() { return calls[calls.length - 1]!.url; } };
}

function client(rec: ReturnType<typeof recorder>) {
  return new PostFinder({ fetch: rec.fetchImpl });
}

describe("search", () => {
  it("returns the rows the service sent, as they were sent", async () => {
    const rec = recorder(SEARCH);
    const hits = await client(rec).search("coburg");

    expect(hits).toHaveLength(2);
    expect(hits[0]!.kind).toBe("locality");
    expect(hits[0]!.place_count).toBe(14);
    expect(hits[0]!.postcode).toBe("3058");
    expect(hits[1]!.locality).toBe("coburg");
  });

  it("sends the query and the limit to the right endpoint", async () => {
    const rec = recorder();
    await client(rec).search("coburg", { limit: 5 });

    expect(rec.url).toBe("https://api.postfinder.io/v1/search?q=coburg&limit=5");
  });

  it("costs no request below two characters", async () => {
    const rec = recorder();
    expect(await client(rec).search("c")).toEqual([]);
    expect(await client(rec).search("  ")).toEqual([]);
    expect(rec.calls).toEqual([]);
  });

  it("passes an abort signal through, so a superseded keystroke is cancelled", async () => {
    const rec = recorder();
    const controller = new AbortController();
    await client(rec).search("coburg", { signal: controller.signal });

    expect(rec.calls[0]!.init?.signal).toBe(controller.signal);
  });

  it("encodes the query rather than interpolating it", async () => {
    const rec = recorder();
    await client(rec).search("coburg & brunswick", { limit: 5 });

    expect(rec.url).toContain("q=coburg+%26+brunswick");
    expect(rec.url.match(/limit=/g)).toHaveLength(1);
  });
});

describe("nearby", () => {
  it("returns places with a distance", async () => {
    const rec = recorder(NEARBY);
    const found = await client(rec).nearby({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
    });

    expect(found[0]!.name).toBe("Coburg Post Office");
    expect(found[0]!.distance_km).toBeCloseTo(0.42);
    expect(found[0]!.hours).toEqual({ mon: "9:00-17:00" });
  });

  it("sends every parameter the endpoint requires", async () => {
    const rec = recorder(NEARBY);
    await client(rec).nearby({ lat: -37.7404, lng: 144.9633, category: "parcel-lockers", country: "australia" });

    for (const part of ["lat=-37.7404", "lng=144.9633", "category=parcel-lockers", "country=australia"]) {
      expect(rec.url).toContain(part);
    }
  });

  it("refuses a category that does not exist, before the request", async () => {
    const rec = recorder(NEARBY);
    await expect(
      // @ts-expect-error a bad category is a type error too; this is the runtime half
      client(rec).nearby({ lat: -37.7, lng: 144.9, category: "postboxes", country: "australia" }),
    ).rejects.toThrow(/post-boxes/);
    expect(rec.calls).toEqual([]);
  });

  it("refuses a coordinate that is not on the globe", async () => {
    const rec = recorder(NEARBY);
    const pf = client(rec);
    await expect(pf.nearby({ lat: -91, lng: 144.9, category: "post-offices", country: "australia" })).rejects.toThrow();
    await expect(pf.nearby({ lat: -37.7, lng: 181, category: "post-offices", country: "australia" })).rejects.toThrow();
    await expect(pf.nearby({ lat: NaN, lng: 144.9, category: "post-offices", country: "australia" })).rejects.toThrow();
    expect(rec.calls).toEqual([]);
  });

  it("publishes the categories", () => {
    expect(CATEGORIES).toEqual([
      "post-offices",
      "post-boxes",
      "express-post-boxes",
      "parcel-lockers",
      "drop-off-points",
      "collection-points",
    ]);
  });
});

describe("a place, a suburb, a country", () => {
  it("reads a place by its public id", async () => {
    const rec = recorder(PLACE);
    const detail = await client(rec).place("k7m2p9x4");

    expect(rec.url).toBe("https://api.postfinder.io/v1/places/k7m2p9x4");
    expect(detail.place.name).toBe("Coburg Post Office");
    expect(detail.reviews.summary.average).toBe(4.5);
  });

  it("raises NotFound for an id nothing is filed under", async () => {
    const rec = recorder({ title: "place not found", status: 404, detail: "" }, 404);
    await expect(client(rec).place("nosuchid")).rejects.toBeInstanceOf(NotFound);

    const rec2 = recorder({ title: "place not found", status: 404 }, 404);
    await client(rec2)
      .place("nosuchid")
      .catch((err: PostFinderError) => {
        expect(err.status).toBe(404);
        expect(err.title).toBe("place not found");
        expect(err).toBeInstanceOf(PostFinderError);
      });
  });

  it("reads a suburb", async () => {
    const rec = recorder({ data: { locality: { slug: "coburg", name: "Coburg" } } });
    await client(rec).locality("australia", "victoria", "coburg");

    expect(rec.url).toBe("https://api.postfinder.io/v1/localities/australia/victoria/coburg");
  });

  it("pages a region's localities", async () => {
    const rec = recorder({ data: { locality_total: 3021, localities: [] } });
    const detail = await client(rec).region("australia", "victoria", { limit: 1, offset: 200 });

    expect(rec.url).toBe(
      "https://api.postfinder.io/v1/countries/australia/regions/victoria?limit=1&offset=200",
    );
    expect(detail.locality_total).toBe(3021);
  });

  it("reads a category hub, narrowed to a region when asked", async () => {
    const rec = recorder({ data: { total: 621 } });
    await client(rec).category("australia", "parcel-lockers", { region: "victoria" });

    expect(rec.url).toBe(
      "https://api.postfinder.io/v1/countries/australia/categories/parcel-lockers?region=victoria",
    );
  });

  it("lists countries", async () => {
    const rec = recorder({ data: [{ slug: "australia", name: "Australia", place_count: 40122 }] });
    const countries = await client(rec).countries();

    expect(rec.url).toBe("https://api.postfinder.io/v1/countries");
    expect(countries[0]!.place_count).toBe(40122);
  });
});

describe("postcodes", () => {
  it("reads the whole index", async () => {
    const rec = recorder(POSTCODES);
    const index = await client(rec).postcodes("australia");

    expect(rec.url).toBe("https://api.postfinder.io/v1/countries/australia/postcodes");
    expect(index.total).toBe(3);
    expect(index.regions[0]!.entries[0]!.name).toBe("Coburg");
  });

  it("looks a postcode up in an index already fetched, without rescanning it", () => {
    const index = POSTCODES.data as PostcodeIndex;

    expect(suburbsIn(index, "3058").map((e) => e.name)).toEqual(["Coburg", "Merlynston"]);
    expect(suburbsIn(index, "2044").map((e) => e.name)).toEqual(["Sydenham"]);
    expect(suburbsIn(index, "9999")).toEqual([]);
    // The same array back: the map is built once per index and kept beside it.
    expect(suburbsIn(index, "3058")).toBe(suburbsIn(index, "3058"));
  });

  it("reads one postcode", async () => {
    const rec = recorder({ data: { postcode: "3058", total: 16, localities: [] } });
    const detail = await client(rec).postcode("australia", "3058");

    expect(rec.url).toBe("https://api.postfinder.io/v1/countries/australia/postcodes/3058");
    expect(detail.postcode).toBe("3058");
  });

  it("refuses a postcode the service does not take, before the request", async () => {
    const rec = recorder();
    await expect(client(rec).postcode("australia", "SW1A 1AA")).rejects.toThrow();
    await expect(client(rec).postcode("australia", "12")).rejects.toThrow();
    expect(rec.calls).toEqual([]);
  });
});

describe("paths", () => {
  it("builds a suburb page path", () => {
    expect(localityPath("australia", "victoria", "coburg")).toBe("/en/australia/victoria/coburg/");
  });

  it("builds a place page path, which carries the brand as a segment", () => {
    expect(placePath("australia", "victoria", "coburg", "australia-post", "coburg-post-office")).toBe(
      "/en/australia/victoria/coburg/australia-post/coburg-post-office/",
    );
  });

  it("files a place with no brand under unbranded, as the server does", () => {
    expect(placePath("australia", "victoria", "coburg", "", "a-post-box")).toBe(
      "/en/australia/victoria/coburg/unbranded/a-post-box/",
    );
  });

  it("gives a search hit the page it links to", async () => {
    const rec = recorder(SEARCH);
    const [suburb, place] = await client(rec).search("coburg");

    expect(hitPath(suburb!)).toBe("/en/australia/victoria/coburg/");
    // A place row carries no brand key, so it links to its suburb. That is what
    // the API's own MCP tool does with the same row.
    expect(hitPath(place!)).toBe("/en/australia/victoria/coburg/");
  });

  it("returns an empty path rather than a broken one when a slug is missing", () => {
    expect(localityPath("australia", "", "coburg")).toBe("");
    expect(placePath("australia", "victoria", "coburg", "australia-post", "")).toBe("");
  });
});

describe("errors", () => {
  it("maps 400 to BadRequest and 429 to RateLimited", async () => {
    await expect(client(recorder({ title: "invalid nearby search" }, 400)).search("coburg")).rejects.toBeInstanceOf(
      BadRequest,
    );
    await expect(client(recorder({ title: "too many" }, 429)).search("coburg")).rejects.toBeInstanceOf(RateLimited);
  });

  it("carries retry-after when the service sent one", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ title: "too many" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      })) as unknown as typeof globalThis.fetch;

    await new PostFinder({ fetch: fetchImpl }).search("coburg").catch((err: RateLimited) => {
      expect(err.retryAfter).toBe(30);
    });
    expect.assertions(1);
  });

  it("still raises with the status when the body is not JSON", async () => {
    const fetchImpl = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof globalThis.fetch;

    await expect(new PostFinder({ fetch: fetchImpl }).search("coburg")).rejects.toMatchObject({ status: 502 });
  });

  it("keeps a field it does not know rather than dropping it", async () => {
    const rec = recorder({ data: [{ ...SEARCH.data[0], something_new: "x" }] });
    const hits = await client(rec).search("coburg");

    expect((hits[0] as unknown as Record<string, unknown>).something_new).toBe("x");
  });
});

describe("requests", () => {
  it("sends no credential and asks for JSON", async () => {
    const rec = recorder();
    await client(rec).search("coburg");
    const headers = new Headers(rec.calls[0]!.init?.headers);

    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("can be pointed at a proxy of your own", async () => {
    const rec = recorder();
    await new PostFinder({ baseUrl: "https://postfinder.example.com/api/", fetch: rec.fetchImpl }).search("coburg");

    expect(rec.url).toBe("https://postfinder.example.com/api/v1/search?q=coburg");
  });
});
