/**
 * PostFinder: post offices, parcel lockers and post boxes, as an API.
 *
 * Free, keyless and cached at the edge. The directory behind postfinder.io.
 *
 * ```ts
 * import { PostFinder } from "@postfinder/client";
 *
 * const pf = new PostFinder();
 * const near = await pf.nearby({
 *   lat: -37.7404, lng: 144.9633,
 *   category: "post-offices", country: "australia",
 * });
 * ```
 *
 * Data from OpenStreetMap (ODbL) and GeoNames (CC BY 4.0). Publishing what you
 * get back means carrying those credits: postfinder.io/en/legal/.
 */

export {
  DEFAULT_BASE_URL,
  MIN_QUERY,
  PostFinder,
  VERSION,
  createClient,
  type ClientOptions,
  type NearbyOptions,
  type PageOptions,
  type RequestOptions,
  type SearchOptions,
} from "./client";

export { BadRequest, NotFound, PostFinderError, RateLimited } from "./errors";

export { countryPath, hitPath, localityPath, metres, placePath, suburbsIn } from "./paths";

export {
  CATEGORIES,
  type CategoryHub,
  type Category,
  type Country,
  type CountryDetail,
  type CountrySummary,
  type Envelope,
  type Facet,
  type Locality,
  type LocalityDetail,
  type LocalityLink,
  type LocalitySummary,
  type NearbyPlace,
  type Photo,
  type Place,
  type PlaceDetail,
  type PlaceLink,
  type PostcodeDetail,
  type PostcodeEntry,
  type PostcodeIndex,
  type Region,
  type RegionDetail,
  type RegionPostcodes,
  type RegionSummary,
  type Review,
  type ReviewSummary,
  type Reviews,
  type SearchHit,
} from "./types";
