/**
 * Where a row lives on postfinder.io.
 *
 * Every row the API returns carries the slugs its page path is built from, so a
 * caller linking to the site needs no second request. These build the path the
 * server itself builds, in one place, rather than in every consumer's template.
 */

import type { PostcodeEntry, PostcodeIndex, SearchHit } from "./types";

/** The site serves one language today and its paths carry the prefix. */
const LANG = "en";

/** The suburb page: `/en/australia/victoria/coburg/`. */
export function localityPath(country: string, region: string, locality: string): string {
  if (!country || !region || !locality) return "";
  return `/${LANG}/${country}/${region}/${locality}/`;
}

/**
 * The location page, which carries the brand as a segment.
 *
 * A place with no brand is filed under `unbranded`, which is what the server
 * stores rather than a special case invented here.
 */
export function placePath(
  country: string,
  region: string,
  locality: string,
  brand: string,
  slug: string,
): string {
  if (!country || !region || !locality || !slug) return "";
  return `/${LANG}/${country}/${region}/${locality}/${brand || "unbranded"}/${slug}/`;
}

/** The country page: `/en/australia/`. */
export function countryPath(country: string): string {
  return country ? `/${LANG}/${country}/` : "";
}

/**
 * The page a typeahead row links to.
 *
 * A suburb row links to its own page. A place row links to its suburb: a
 * location's path carries a brand segment and a search row does not carry the
 * brand key, so the exact path comes from `place()`. This is what the API's own
 * MCP tool does with the same row.
 */
export function hitPath(hit: SearchHit): string {
  if (hit.kind === "locality") return localityPath(hit.country, hit.region, hit.slug);
  if (hit.kind === "place") return localityPath(hit.country, hit.region, hit.locality ?? "");
  return "";
}

/** Metres, rounded. What a page prints: "420 m", not "0.42 km". */
export function metres(distanceKm: number): number {
  return Math.round(distanceKm * 1000);
}

// One map per index, built on first use and kept beside it rather than in it: a
// WeakMap means holding the cache cannot keep a discarded index alive, and the
// response object is handed back exactly as it arrived.
const byPostcode = new WeakMap<PostcodeIndex, Map<string, PostcodeEntry[]>>();

const NONE: PostcodeEntry[] = [];

/**
 * The suburbs one postcode covers, from an index already fetched.
 *
 * A postcode is not a suburb: 3058 is Coburg, Coburg North and Merlynston. The
 * map is built once per index, so resolving a column of ten thousand postcodes
 * is one pass over the country rather than ten thousand walks through every
 * state.
 */
export function suburbsIn(index: PostcodeIndex, postcode: string): PostcodeEntry[] {
  let table = byPostcode.get(index);
  if (!table) {
    table = new Map();
    for (const group of index.regions ?? []) {
      for (const entry of group.entries ?? []) {
        const rows = table.get(entry.postcode);
        if (rows) rows.push(entry);
        else table.set(entry.postcode, [entry]);
      }
    }
    byPostcode.set(index, table);
  }
  return table.get(String(postcode).trim()) ?? NONE;
}
