import { extractAuth, parseTimeline, graphqlError, type Tweet } from "./parse.js";
import { resolveQid } from "./cache.js";

// Native X/Twitter GraphQL client. Keyless cookie auth (auth_token + ct0; ct0 is
// also the CSRF token). Query IDs rotate — resolved from env → cache → (heal).

const DEFAULT_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

const FEATURES: Record<string, boolean> = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  articles_preview_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
};

export type Result = { ok: true; tweets: Tweet[] } | { ok: false; error: string };
export type ClientOpts = { cookie: string; cacheDir?: string; bearer?: string; features?: object };

function headers(cookie: string, ct0: string, bearer?: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearer ?? process.env.X_NATIVE_BEARER ?? DEFAULT_BEARER}`,
    "x-csrf-token": ct0,
    cookie,
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "content-type": "application/json",
    "user-agent": UA,
    accept: "*/*",
  };
}

async function graphql(op: string, variables: object, o: ClientOpts): Promise<Result> {
  const auth = extractAuth(o.cookie);
  if (!auth) return { ok: false, error: "cookie missing auth_token/ct0" };
  const qid = resolveQid(op, o.cacheDir);
  if (!qid) return { ok: false, error: `no query id for ${op} — run \`x-native heal\` (or set X_NATIVE_QID_${op.toUpperCase()})` };
  const features = JSON.stringify(o.features ?? FEATURES);
  const url = `https://x.com/i/api/graphql/${qid}/${op}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(features)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: headers(o.cookie, auth.ct0, o.bearer), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `X returned HTTP ${res.status}${res.status === 403 ? " (cookie expired or blocked)" : ""}` };
    const json: unknown = await res.json();
    const ge = graphqlError(json);
    return ge ? { ok: false, error: ge } : { ok: true, tweets: parseTimeline(json) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function searchTimeline(opts: ClientOpts & { query: string; max?: number; latest?: boolean }): Promise<Result> {
  return graphql("SearchTimeline", { rawQuery: opts.query, count: opts.max ?? 20, querySource: "typed_query", product: opts.latest ? "Latest" : "Top" }, opts);
}

export function getBookmarks(opts: ClientOpts & { max?: number }): Promise<Result> {
  return graphql("Bookmarks", { count: opts.max ?? 20, includePromotedContent: false }, opts);
}
