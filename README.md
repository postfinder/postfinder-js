# @postfinder/client

**Post offices, parcel lockers and post boxes, as an API.** Ask what is nearest a
coordinate, look up what a postcode covers, or read a suburb's locations.

- Free and keyless. No account, no quota to buy, nothing to configure
- Runs anywhere there is `fetch`: a browser, a worker, a Node or Bun server, an
  SSR loader
- Typed against the wire, with field names as the API sends them, so the docs and
  your editor agree
- No dependencies

```sh
npm install @postfinder/client
```

Building a search box or a "what is near me" list? [`@postfinder/react`](https://www.npmjs.com/package/@postfinder/react)
and [`@postfinder/vue`](https://www.npmjs.com/package/@postfinder/vue) carry the
debouncing, cancelling and keyboard handling for you. They stand alone, so use
this one when you want the whole read surface: postcodes, suburbs, regions and
category hubs.

## Quick start

```ts
import { PostFinder } from "@postfinder/client";

const pf = new PostFinder();

const near = await pf.nearby({
  lat: -37.7404,
  lng: 144.9633,
  category: "post-offices",
  country: "australia",
});

for (const place of near) {
  console.log(place.name, place.address, `${place.distance_km * 1000} m`);
}
```

Nearest first, within 50km, at most 30 rows. That is the question "where do I
post this", which is a different question from "list every post box in Victoria".

## The six categories

```ts
import { CATEGORIES, type Category } from "@postfinder/client";
```

`post-offices`, `post-boxes`, `express-post-boxes`, `parcel-lockers`,
`drop-off-points`, `collection-points`.

`Category` is a union, so a wrong name is a type error. It also throws before the
request goes out, for the code paths a type cannot reach.

## Typeahead

```ts
const controller = new AbortController();

const hits = await pf.search("coburg", { limit: 8, signal: controller.signal });
for (const hit of hits) {
  console.log(hit.kind, hit.name, hit.postcode);
}
```

Two characters minimum: below that it returns `[]` without asking, which is what
the service answers anyway. Debounce by at least 150ms and pass a `signal`, so a
superseded keystroke is cancelled rather than raced.

## Linking back to the site

Every row carries the slugs its page path is built from, so no second request is
needed:

```ts
import { hitPath, localityPath, placePath, metres } from "@postfinder/client";

hitPath(hits[0]);                        // /en/australia/victoria/coburg/
placePath("australia", "victoria", "coburg", place.brand, place.slug);
metres(place.distance_km);               // 420
```

A location's path carries its brand as a segment, and a place with no brand is
filed under `unbranded`. A search row does not carry the brand key, so a place
hit links to its suburb; `place()` returns the exact path.

## Postcodes

A postcode is not a suburb. 3058 is Coburg, Coburg North and Merlynston, and an
address in any of them is written with the same four digits.

```ts
const detail = await pf.postcode("australia", "3058");
detail.localities.map((l) => l.name);   // ["Coburg", "Coburg North", "Merlynston"]
```

The whole country comes in one response, and it is meant to be kept:

```ts
import { suburbsIn } from "@postfinder/client";

const index = await pf.postcodes("australia");   // one request
suburbsIn(index, "3058");                        // no request, and no rescan
```

`suburbsIn` builds its map on first use and keeps it beside the index in a
`WeakMap`, so resolving a column of ten thousand postcodes is one pass over the
country rather than ten thousand walks through every state. The response itself is
handed back untouched.

## A location, a suburb, a country

```ts
const place = await pf.place("k7m2p9x4");
const suburb = await pf.locality("australia", "victoria", "coburg");

await pf.countries();
await pf.country("australia");
await pf.region("australia", "victoria", { limit: 100, offset: 0 });
await pf.category("australia", "parcel-lockers", { region: "victoria" });
```

A place's public id is permanent. It is minted once and never derived from a
source record, so a feed that renumbers its rows does not change it. Store the id,
not the name or the path.

## Errors

```ts
import { NotFound, RateLimited, PostFinderError } from "@postfinder/client";

try {
  await pf.place(storedId);
} catch (err) {
  if (err instanceof NotFound) return null;   // retired, or never there
  throw err;
}
```

`NotFound` is ordinary rather than a failure: a suburb with no locations has no
page, and a location that closed is retired. Every error carries the `status`,
`title` and `detail` the service sent, and `RateLimited` carries `retryAfter`
when the service said.

## In an SSR loader

```ts
// app/routes/nearest.tsx
import { PostFinder } from "@postfinder/client";

const pf = new PostFinder();

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return {
    near: await pf.nearby({
      lat: Number(url.searchParams.get("lat")),
      lng: Number(url.searchParams.get("lng")),
      category: "parcel-lockers",
      country: "australia",
      signal: request.signal,
    }),
  };
}
```

Passing `request.signal` means a visitor who navigates away takes their request
with them.

## Being a good citizen

The API is free and asks for care in return: around a thousand requests a month
from one address, answers kept rather than re-fetched, typing debounced. If you
need more, say what you are building at
[postfinder.io/en/contact/](https://postfinder.io/en/contact/).

```ts
const pf = new PostFinder({ contact: "https://example.com/about-our-bot" });
```

## Attribution

Locations come from OpenStreetMap (ODbL), localities and postcodes from GeoNames
(CC BY 4.0). If you publish what you get back, you carry those credits with it.
The [sources page](https://postfinder.io/en/legal/) names each one.

## Also available

| | |
|---|---|
| React | [`@postfinder/react`](https://www.npmjs.com/package/@postfinder/react) |
| Vue | [`@postfinder/vue`](https://www.npmjs.com/package/@postfinder/vue) |
| Python | [`postfinder`](https://pypi.org/project/postfinder/) |
| Go | [`postfinder-go`](https://github.com/postfinder/postfinder-go) |

Looking for Australian street addresses rather than locations? That is
[Locio](https://locio.com.au): G-NAF address autocomplete, validation and
geocoding.

## Licence

MIT.
