import { errorFor } from "./errors";
import {
  CATEGORIES,
  type CategoryHub,
  type Category,
  type CountryDetail,
  type CountrySummary,
  type Envelope,
  type LocalityDetail,
  type NearbyPlace,
  type PlaceDetail,
  type PostcodeDetail,
  type PostcodeIndex,
  type RegionDetail,
  type SearchHit,
} from "./types";

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.postfinder.io";

/** The service answers an empty list below this, so there is nothing to ask. */
export const MIN_QUERY = 2;

export interface ClientOptions {
  /** Point somewhere else: a proxy of your own, or a test server. */
  baseUrl?: string;
  /**
   * A URL or an email address, which travels in a `X-Contact` header.
   *
   * The API is free and asks callers doing real volume to say what they are
   * building. Being contactable is how that conversation starts before a rate
   * limit does. Left out, nothing is sent.
   *
   * Browsers refuse to set `User-Agent`, which is where a server side client
   * would put this, so it goes in a header of its own.
   */
  contact?: string;
  /** Your own fetch, for a custom transport or for testing. */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  /** Cancel a request whose answer is no longer wanted. */
  signal?: AbortSignal;
}

export interface SearchOptions extends RequestOptions {
  /** How many rows, up to 25. */
  limit?: number;
}

export interface NearbyOptions extends RequestOptions {
  lat: number;
  lng: number;
  category: Category;
  /** The country slug the site's URLs use: `australia`, `new-zealand`. */
  country: string;
}

export interface PageOptions extends RequestOptions {
  limit?: number;
  offset?: number;
}

/**
 * A client for the PostFinder directory API.
 *
 * Post offices, post boxes, express post boxes, parcel lockers, drop off points
 * and collection points, plus the suburbs and postcodes they sit in. Free,
 * keyless and cached at the edge.
 *
 * ```ts
 * const pf = new PostFinder();
 * const near = await pf.nearby({
 *   lat: -37.7404, lng: 144.9633,
 *   category: "post-offices", country: "australia",
 * });
 * ```
 *
 * Runs anywhere there is `fetch`: a browser, a worker, a server. Nothing is
 * stored on the instance between calls, so one can be shared.
 *
 * Attribution travels with the data: locations from OpenStreetMap (ODbL),
 * localities and postcodes from GeoNames (CC BY 4.0). See postfinder.io/en/legal/.
 */
export class PostFinder {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = checkBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.headers = { Accept: "application/json" };

    const contact = (options.contact ?? "").trim();
    if (contact) {
      // A header value, so a newline in it would be a header the caller did not
      // write. Browsers reject those anyway; a server runtime may not.
      if (/[\r\n\0]/.test(contact)) {
        throw new Error("postfinder: contact must be one line: a URL or an email address");
      }
      this.headers["X-Contact"] = contact;
    }

    const impl = options.fetch ?? globalThis.fetch;
    if (typeof impl !== "function") {
      throw new Error(
        "postfinder: no fetch in this runtime. Pass one: new PostFinder({ fetch })",
      );
    }
    // Bound, so a fetch read off globalThis is not called with the wrong this.
    this.fetchImpl = options.fetch ? impl : impl.bind(globalThis);
  }

  /**
   * Suburbs and locations matching what somebody has typed.
   *
   * Rows come back most useful first, each carrying enough to link to the page
   * it names. Debounce by at least 150ms and pass a `signal`, so a superseded
   * keystroke is cancelled rather than raced.
   *
   * A term shorter than two characters answers an empty array without a
   * request, which is what the service answers anyway.
   */
  async search(term: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    const q = (term ?? "").trim();
    if (q.length < MIN_QUERY) return [];
    const body = await this.get<SearchHit[]>("/v1/search", { q, limit: options.limit }, options);
    return body.data ?? [];
  }

  /**
   * The closest locations of one category to a coordinate, nearest first.
   *
   * Within 50km and at most 30 rows: the question "where is the nearest one",
   * not "list everything in the state".
   */
  async nearby(options: NearbyOptions): Promise<NearbyPlace[]> {
    if (!(CATEGORIES as readonly string[]).includes(options.category)) {
      throw new Error(
        `postfinder: ${String(options.category)} is not a category; use one of ${CATEGORIES.join(", ")}`,
      );
    }
    const { lat, lng } = coordinate(options.lat, options.lng);
    const body = await this.get<NearbyPlace[]>(
      "/v1/nearby",
      { lat, lng, category: options.category, country: slug(options.country, "country") },
      options,
    );
    return body.data ?? [];
  }

  /**
   * One location by its public id, with what is near it.
   *
   * The id is permanent: minted once and never derived from a source record, so
   * a feed that renumbers its rows does not change it. Store the id.
   *
   * Rejects with {@link NotFound} when nothing is filed under it.
   */
  async place(publicId: string, options: RequestOptions = {}): Promise<PlaceDetail> {
    const body = await this.get<PlaceDetail>(`/v1/places/${slug(publicId, "place id")}`, {}, options);
    return body.data;
  }

  /** Every country with pages, and how much is in each. */
  async countries(options: RequestOptions = {}): Promise<CountrySummary[]> {
    const body = await this.get<CountrySummary[]>("/v1/countries", {}, options);
    return body.data ?? [];
  }

  /** One country and its states or regions. */
  async country(country: string, options: RequestOptions = {}): Promise<CountryDetail> {
    const body = await this.get<CountryDetail>(`/v1/countries/${slug(country, "country")}`, {}, options);
    return body.data;
  }

  /** One state or region and its localities, a page at a time. */
  async region(country: string, region: string, options: PageOptions = {}): Promise<RegionDetail> {
    const body = await this.get<RegionDetail>(
      `/v1/countries/${slug(country, "country")}/regions/${slug(region, "region")}`,
      { limit: options.limit, offset: options.offset },
      options,
    );
    return body.data;
  }

  /**
   * One suburb: its locations, its neighbours, and what to filter by.
   *
   * Rejects with {@link NotFound} for a suburb with no locations: those have no
   * page, deliberately.
   */
  async locality(
    country: string,
    region: string,
    locality: string,
    options: RequestOptions = {},
  ): Promise<LocalityDetail> {
    const body = await this.get<LocalityDetail>(
      `/v1/localities/${slug(country, "country")}/${slug(region, "region")}/${slug(locality, "locality")}`,
      {},
      options,
    );
    return body.data;
  }

  /** One category across a country: counts per state, busiest suburbs. */
  async category(
    country: string,
    category: string,
    options: RequestOptions & { region?: string } = {},
  ): Promise<CategoryHub> {
    const body = await this.get<CategoryHub>(
      `/v1/countries/${slug(country, "country")}/categories/${slug(category, "category")}`,
      { region: options.region },
      options,
    );
    return body.data;
  }

  /**
   * Every postcode in a country, grouped by state.
   *
   * One response, meant to be kept: `suburbsIn` answers from it without another
   * call.
   */
  async postcodes(country: string, options: RequestOptions = {}): Promise<PostcodeIndex> {
    const body = await this.get<PostcodeIndex>(
      `/v1/countries/${slug(country, "country")}/postcodes`,
      {},
      options,
    );
    return body.data;
  }

  /**
   * The suburbs one postcode covers, busiest first.
   *
   * A postcode is not a suburb: 3058 is Coburg, Coburg North and Merlynston.
   *
   * Three to five digits. Letters are a different problem, the UK and Canada,
   * and the service does not take them, so neither does this.
   */
  async postcode(country: string, postcode: string, options: RequestOptions = {}): Promise<PostcodeDetail> {
    const code = String(postcode ?? "").trim();
    if (!/^\d{3,5}$/.test(code)) {
      throw new Error(
        `postfinder: ${postcode} is not a postcode this API takes; three to five digits`,
      );
    }
    const body = await this.get<PostcodeDetail>(
      `/v1/countries/${slug(country, "country")}/postcodes/${code}`,
      {},
      options,
    );
    return body.data;
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    options: RequestOptions,
  ): Promise<Envelope<T>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      // A NaN reaches a URL as the word "NaN" and comes back as a 400 that
      // reads like the service's fault. Counts are whole and not negative.
      if ((key === "limit" || key === "offset") && typeof value === "number") {
        if (!Number.isInteger(value) || value < 0) {
          throw new Error(`postfinder: ${key} must be a whole number, not ${value}`);
        }
      }
      query.set(key, String(value));
    }
    const url = this.baseUrl + path + (query.size ? `?${query}` : "");

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.headers,
      signal: options.signal,
      // Nothing here is authenticated, and a cookie on a cacheable GET is how a
      // shared cache comes to hold something that belongs to one visitor. A
      // page that happens to have a cookie for this domain does not send it.
      credentials: "omit",
    });

    // A problem document is JSON; a proxy having a bad day is not. Either way
    // the status is the part a caller can act on, so parsing never decides
    // whether an error is raised.
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const envelope = (body && typeof body === "object" ? body : {}) as Envelope<T> &
      Record<string, string>;

    if (!response.ok) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      throw errorFor(
        response.status,
        envelope.title ?? "",
        envelope.detail ?? "",
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    return envelope;
  }
}

/** Shorthand for `new PostFinder(options)`, for code that prefers a factory. */
export function createClient(options: ClientOptions = {}): PostFinder {
  return new PostFinder(options);
}

/**
 * One path segment, encoded.
 *
 * Nothing unencoded: the API separates its products by path prefix and the
 * ingress routes them separately, so a slug carrying a slash is not a cosmetic
 * problem. It is how a directory call becomes a call to something else.
 */
function slug(value: string, what: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`postfinder: no ${what}`);
  return encodeURIComponent(text);
}

function coordinate(lat: number, lng: number): { lat: number; lng: number } {
  // Written as a range check NaN cannot pass, rather than as a NaN test.
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    throw new Error(
      `postfinder: (${lat}, ${lng}) is not a point on the globe; lat -90..90, lng -180..180`,
    );
  }
  return { lat, lng };
}

/**
 * Refuse a base URL that would put the request somewhere it should not go.
 *
 * https always, and plaintext http only to loopback, which is what a local proxy
 * and a test server need. There is no key to leak here, but a query does carry
 * what somebody typed, and in this product that is frequently their own address.
 */
function checkBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`postfinder: base URL ${raw} is not absolute`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      `postfinder: base URL ${raw} carries credentials, and the host it would reach is not the one it reads as`,
    );
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)) {
    return raw.replace(/\/+$/, "");
  }
  if (parsed.protocol === "http:") {
    throw new Error(
      `postfinder: base URL ${raw} is plaintext http to a public host, which would send what people type in the clear`,
    );
  }
  throw new Error(`postfinder: base URL ${raw} has scheme ${parsed.protocol}, want https`);
}
