# x-native

[![CI](https://github.com/jpoindexter/x-native/actions/workflows/ci.yml/badge.svg)](https://github.com/jpoindexter/x-native/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](package.json)

**Native TypeScript client for X/Twitter's GraphQL** — search, bookmarks, read tweets. Keyless **cookie auth**, **zero dependencies**, no Python, and **self-healing query IDs**.

X has no open API like Reddit's `.json` — its web app talks to a locked internal GraphQL endpoint with a bearer token, a CSRF token, and **query IDs that rotate every few weeks**. Most tools offload that churn to a maintained Python CLI. `x-native` does it in TypeScript instead: it authenticates with your browser cookie and **re-scrapes the current query IDs from X's own web bundles** when they change.

> ⚠️ **Honest caveat.** X is anti-bot. `x-native` uses plain `fetch`, which can't replicate Chrome's TLS fingerprint the way `curl_cffi`-based tools do — so X may rate-limit or `403` requests from some IPs/datacenters. The wiring is correct; live coverage depends on X, your cookie, and your network. Use a **dedicated/secondary account** — scripted access can get accounts flagged.

## Install

```bash
git clone <this repo> && cd x-native
npm install && npm run build      # or: npx tsx src/cli.ts <cmd>
```

## Auth (your cookie)

Export your `x.com` session with the **Cookie-Editor** browser extension (Export → JSON) — it must include `auth_token` and `ct0`. Then:

```bash
export X_COOKIE='[{"name":"auth_token","value":"…"},{"name":"ct0","value":"…"}, …]'   # the JSON export
# or a plain header:
export X_COOKIE='auth_token=…; ct0=…'
# or point at a file:
x-native search "…" --cookie-file ./x-cookies.json
```

The cookie stays local. `ct0` doubles as the CSRF token.

## Use

```bash
# 1) fetch X's current GraphQL query IDs (pass your cookie so it can reach logged-in routes like Bookmarks)
x-native heal

# 2) go
x-native search "manual invoicing" --latest --max 30
x-native bookmarks --max 50 --json
```

### Library

```ts
import { searchTimeline, getBookmarks, refreshQueryIds, toCookieHeader } from "x-native";

const cookie = toCookieHeader(process.env.X_COOKIE!)!;
await refreshQueryIds({ cookie });                       // populate query IDs
const r = await getBookmarks({ cookie, max: 50 });
if (r.ok) for (const t of r.tweets) console.log(`@${t.handle} ♥${t.likes}: ${t.text}`);
```

Every call returns `{ ok: true, tweets } | { ok: false, error }` — errors as values, never throws across the boundary.

## How the self-heal works

`refreshQueryIds` fetches `x.com`, then crawls its client-web JS bundles **two levels deep** (a bundle can reference another bundle), extracting every `operationName → queryId` pair into a small cache (`~/.x-native/qids.json`). When X rotates an ID, re-run `x-native heal`.

- **Search** (`SearchTimeline`) is in a top-level bundle — the heal finds it reliably, even logged-out.
- **Bookmarks** is a **logged-in-only** route, so its query ID lives in a bundle X only serves to an authenticated session. **Pass your cookie to `heal`** so it crawls the logged-in app. If it still can't find it, grab the ID once from your browser DevTools (open `x.com/i/bookmarks` → Network → the `Bookmarks` GraphQL request URL is `…/graphql/<ID>/Bookmarks`) and set `X_NATIVE_QID_BOOKMARKS`.

## Config (escape hatches)

| Env | Purpose |
|-----|---------|
| `X_COOKIE` | cookie header or Cookie-Editor JSON export |
| `X_NATIVE_HOME` | cache dir (default `~/.x-native`) |
| `X_NATIVE_QID_<OP>` | pin a query ID (e.g. `X_NATIVE_QID_BOOKMARKS`) |
| `X_NATIVE_BEARER` | override the web bearer token |

## API

`searchTimeline({cookie, query, max?, latest?})` · `getBookmarks({cookie, max?})` · `refreshQueryIds({cookie?, cacheDir?})` · pure helpers `extractAuth` · `parseTimeline` · `extractQueryIds` · `bundleUrls` · `graphqlError` · `cookieFromEditorJson` · `toCookieHeader`.

## License

MIT
