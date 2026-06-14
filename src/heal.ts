import { extractQueryIds, bundleUrls } from "./parse.js";
import { loadQids, saveQids } from "./cache.js";

// Self-heal: re-scrape X's current GraphQL query IDs from its own web JS bundles
// into the cache. Crawls two levels (the homepage's bundles, then the bundles
// those reference) because logged-in-only endpoints like Bookmarks live in
// lazily-referenced bundles — so pass a logged-in cookie to reach them.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const MAX_BUNDLES = 40;

async function get(url: string, cookie?: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const h: Record<string, string> = { "user-agent": UA };
    if (cookie) h.cookie = cookie;
    const res = await fetch(url, { headers: h, signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

type State = { merged: Record<string, string>; seen: Set<string>; queue: string[] };

async function crawl(url: string, cookie: string | undefined, st: State): Promise<number> {
  const js = await get(url, cookie);
  if (!js) return 0;
  let found = 0;
  for (const [op, qid] of Object.entries(extractQueryIds(js))) {
    if (st.merged[op] !== qid) found++;
    st.merged[op] = qid;
  }
  for (const next of bundleUrls(js)) if (!st.seen.has(next)) st.queue.push(next);
  return found;
}

export type HealResult = { ok: boolean; found: number; qids: Record<string, string>; message: string };

export async function refreshQueryIds(opts: { cookie?: string; cacheDir?: string } = {}): Promise<HealResult> {
  const html = await get("https://x.com/", opts.cookie);
  if (!html) return { ok: false, found: 0, qids: loadQids(opts.cacheDir), message: "could not reach x.com (network or block)" };
  const st: State = { merged: { ...loadQids(opts.cacheDir) }, seen: new Set(), queue: bundleUrls(html) };
  let found = 0;
  while (st.queue.length > 0 && st.seen.size < MAX_BUNDLES) {
    const url = st.queue.shift()!;
    if (st.seen.has(url)) continue;
    st.seen.add(url);
    found += await crawl(url, opts.cookie, st);
  }
  saveQids(st.merged, opts.cacheDir);
  const have = ["SearchTimeline", "Bookmarks"].filter((op) => st.merged[op]);
  const missing = ["SearchTimeline", "Bookmarks"].filter((op) => !st.merged[op]);
  return {
    ok: have.length > 0,
    found,
    qids: st.merged,
    message:
      `crawled ${st.seen.size} bundles; have: ${have.join(", ") || "none"}` +
      (missing.length
        ? `; missing: ${missing.join(", ")} — these live in opaque lazy chunks, so pin them from DevTools: ` +
          missing.map((op) => `X_NATIVE_QID_${op.toUpperCase()}`).join(", ")
        : ""),
  };
}
