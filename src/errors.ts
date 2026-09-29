/** What the API said when it refused. */

/**
 * The service answers RFC 7807 problem documents: a title and a detail written
 * for a person to read and act on. Collapsing that into "HTTP 400" throws away
 * the only part of the answer that says what to do about it.
 */
export class PostFinderError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;

  constructor(status: number, title = "", detail = "") {
    super([title || `HTTP ${status}`, detail].filter(Boolean).join(": "));
    this.name = "PostFinderError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

/**
 * Nothing is filed under that id, slug or postcode.
 *
 * Ordinary rather than a failure: a suburb with no locations has no page, and a
 * location that closed is retired. Code walking a list of stored ids will meet
 * this and should tell it apart from an outage.
 */
export class NotFound extends PostFinderError {
  constructor(status: number, title = "", detail = "") {
    super(status, title, detail);
    this.name = "NotFound";
  }
}

/** The request could not be served as written. */
export class BadRequest extends PostFinderError {
  constructor(status: number, title = "", detail = "") {
    super(status, title, detail);
    this.name = "BadRequest";
  }
}

/**
 * Too many requests from here.
 *
 * The API is free and keyless and asks callers to be gentle: around a thousand
 * requests a month from one address, answers kept rather than re-fetched,
 * typing debounced. If the volume is real, say what you are building at
 * postfinder.io/en/contact/.
 */
export class RateLimited extends PostFinderError {
  /** Seconds the service asked for, when it said. */
  readonly retryAfter?: number;

  constructor(status: number, title = "", detail = "", retryAfter?: number) {
    super(status, title, detail);
    this.name = "RateLimited";
    this.retryAfter = retryAfter;
  }
}

export function errorFor(status: number, title = "", detail = "", retryAfter?: number): PostFinderError {
  if (status === 404) return new NotFound(status, title, detail);
  if (status === 429) return new RateLimited(status, title, detail, retryAfter);
  if (status >= 400 && status < 500) return new BadRequest(status, title, detail);
  return new PostFinderError(status, title, detail);
}
