// Pure parsers for X/Twitter's GraphQL responses + web bundle. No I/O, no deps —
// the brittle, shape-dependent bits, fully unit-testable against fixtures.

export type Tweet = { text: string; handle: string; url: string; likes: number };

/** Pull auth_token + ct0 from a cookie header (ct0 doubles as the CSRF token). */
export function extractAuth(cookieHeader: string): { authToken: string; ct0: string } | null {
  const find = (k: string) => new RegExp(`(?:^|;\\s*)${k}=([^;]+)`).exec(cookieHeader)?.[1];
  const authToken = find("auth_token");
  const ct0 = find("ct0");
  return authToken && ct0 ? { authToken, ct0 } : null;
}

/** Scrape GraphQL operation→queryId pairs from X's web JS (IDs rotate). */
export function extractQueryIds(js: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of js.matchAll(/queryId:"([^"]+)",operationName:"(\w+)"/g)) {
    if (m[1] && m[2]) out[m[2]] = m[1];
  }
  for (const m of js.matchAll(/operationName:"(\w+)"(?:(?!operationName:)[\s\S]){0,200}?queryId:"([^"]+)"/g)) {
    if (m[1] && m[2] && !out[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(o: Record<string, unknown>, k: string): string {
  return typeof o[k] === "string" ? (o[k] as string) : "";
}
function num(o: Record<string, unknown>, k: string): number {
  return typeof o[k] === "number" ? (o[k] as number) : 0;
}

function tweetFrom(result: Record<string, unknown>): Tweet {
  const inner = result.tweet ? rec(result.tweet) : result;
  const legacy = rec(inner.legacy);
  const id = str(inner, "rest_id") || str(legacy, "id_str");
  const userLegacy = rec(rec(rec(rec(inner.core).user_results).result).legacy);
  const handle = str(userLegacy, "screen_name");
  return {
    text: str(legacy, "full_text"),
    handle,
    likes: num(legacy, "favorite_count"),
    url: handle && id ? `https://x.com/${handle}/status/${id}` : "",
  };
}

function collect(node: unknown, out: Tweet[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out);
    return;
  }
  const o = rec(node);
  if (Object.keys(o).length === 0) return;
  if (typeof rec(o.legacy).full_text === "string") out.push(tweetFrom(o));
  for (const v of Object.values(o)) collect(v, out);
}

/** Parse a GraphQL timeline response (search/bookmarks/detail) into tweets. Tolerant. */
export function parseTimeline(json: unknown): Tweet[] {
  const collected: Tweet[] = [];
  collect(json, collected);
  const seen = new Set<string>();
  const out: Tweet[] = [];
  for (const p of collected) {
    if (p.text && p.url && !seen.has(p.url)) {
      seen.add(p.url);
      out.push(p);
    }
  }
  return out;
}

/** Surface a GraphQL `errors[]` message when X rejects a request. */
export function graphqlError(json: unknown): string | null {
  const errors = rec(json).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return str(rec(errors[0]), "message") || "twitter graphql error";
}

/** Every client-web JS bundle URL referenced in a page or another bundle's text. */
export function bundleUrls(text: string): string[] {
  return [...new Set([...text.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web[\w./-]+\.js/g)].map((m) => m[0]))];
}
