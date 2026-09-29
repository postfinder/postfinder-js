/**
 * The shapes the API returns, exactly as it returns them.
 *
 * Field names are the wire's own, snake_case included. Renaming them to
 * camelCase would mean a mapping layer in every call, a second vocabulary to
 * learn beside the docs, and a bug the first time the service adds a field the
 * map does not know. So a response is handed back as it arrived.
 */

/** The categories `/v1/nearby` accepts. */
export const CATEGORIES = [
  "post-offices",
  "post-boxes",
  "express-post-boxes",
  "parcel-lockers",
  "drop-off-points",
  "collection-points",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Country {
  iso2: string;
  slug: string;
  name: string;
}

export interface Region {
  slug: string;
  /** The state or territory code where the country has them: VIC, NSW. */
  code?: string;
  name: string;
}

export interface Locality {
  slug: string;
  name: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  place_count: number;
}

/**
 * One location: a post office, a post box, a parcel locker.
 *
 * `brand` and `category` are keys rather than prose (`australia-post`,
 * `parcel-lockers`), because they are what the site's URLs and filters are
 * built from. A location with no brand is filed under `unbranded`.
 */
export interface Place {
  /** Permanent. Minted once, never derived from a source record: store this. */
  public_id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  address?: string;
  lat: number;
  lng: number;
  /** Opening hours as the source published them. Most post boxes have none. */
  hours?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  last_verified_at?: string;
  closed_at?: string;
}

/** A place with how far away it is, and the slugs of where it sits. */
export interface NearbyPlace extends Place {
  country: string;
  region: string;
  locality: string;
  distance_km: number;
}

/**
 * One row of the typeahead: a suburb or a location.
 *
 * A row of kind `address` exists in the shape but not in this API's answers:
 * api.postfinder.io filters street address rows out.
 */
export interface SearchHit {
  kind: "locality" | "place" | "address";
  slug: string;
  name: string;
  country: string;
  region: string;
  locality?: string;
  /** The suburb's name as text, for a row whose suburb has no page yet. */
  locality_name?: string;
  state?: string;
  postcode?: string;
  place_count?: number;
  lat?: number;
  lng?: number;
  score: number;
  gnaf_pid?: string;
}

export interface CountrySummary {
  iso2: string;
  slug: string;
  name: string;
  region_count: number;
  locality_count: number;
  place_count: number;
}

export interface RegionSummary {
  slug: string;
  code?: string;
  name: string;
  locality_count: number;
  /** On a category hub this counts that category only, not the region total. */
  place_count: number;
}

export interface LocalitySummary {
  slug: string;
  name: string;
  postcode?: string;
  place_count: number;
}

/** A key and how many rows carry it, for a filter that offers what exists. */
export interface Facet {
  key: string;
  count: number;
}

export interface LocalityLink {
  country: string;
  region: string;
  slug: string;
  name: string;
  place_count: number;
  distance_km: number;
}

export interface PlaceLink {
  public_id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  address?: string;
  country: string;
  region: string;
  locality: string;
  distance_km: number;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
  last_as_listed_at: string | null;
}

export interface Review {
  id: number;
  name: string;
  /** What happened when they went: the site asks that rather than only stars. */
  outcome: string;
  rating: number | null;
  body?: string;
  created_at: string;
}

export interface Reviews {
  summary: ReviewSummary;
  recent: Review[];
}

export interface Photo {
  id: string;
  credit?: string;
  licence: string;
  width: number;
  height: number;
  created_at: string;
}

export interface CountryDetail {
  country: Country;
  regions: RegionSummary[];
}

export interface RegionDetail {
  country: Country;
  region: Region;
  localities: LocalitySummary[];
  /** Every locality in the region, not just this page of them. */
  locality_total: number;
}

/**
 * One category across a country: counts per state and the busiest suburbs.
 *
 * Not a national list of every post box, which would be tens of thousands of
 * rows and useful to nobody.
 */
export interface CategoryHub {
  country: Country;
  category: string;
  total: number;
  regions: RegionSummary[];
  localities: LocalityLink[];
}

export interface PostcodeEntry {
  postcode: string;
  slug: string;
  name: string;
  place_count: number;
}

export interface RegionPostcodes {
  region: Region;
  entries: PostcodeEntry[];
}

/** Every postcode in a country, grouped by state. Fetch once and keep it. */
export interface PostcodeIndex {
  country: Country;
  total: number;
  regions: RegionPostcodes[];
}

/** One postcode and the suburbs it covers, busiest first. */
export interface PostcodeDetail {
  country: Country;
  region: Region;
  postcode: string;
  /** Locations across every suburb in the postcode. */
  total: number;
  localities: LocalityLink[];
}

export interface LocalityDetail {
  country: Country;
  region: Region;
  locality: Locality;
  /** Categories present here, with counts: what a filter should offer. */
  categories: Facet[];
  brands: Facet[];
  places: Place[];
  neighbours: LocalityLink[];
}

export interface PlaceDetail {
  country: Country;
  region: Region;
  locality: Locality;
  place: Place;
  nearby: PlaceLink[];
  reviews: Reviews;
  photos: Photo[];
}

/** Every answer arrives wrapped in this. */
export interface Envelope<T> {
  data: T;
  next_cursor?: string;
  country_code?: string;
  /** Why a list is empty, when empty is the right answer. Never an error. */
  note?: string;
  generated_at: string;
}
