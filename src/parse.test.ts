import { describe, it, expect } from "vitest";
import { extractAuth, extractQueryIds, parseTimeline, graphqlError, bundleUrls } from "./parse.js";

describe("extractAuth", () => {
  it("pulls auth_token + ct0", () => {
    expect(extractAuth("x=1; auth_token=abc; ct0=def")).toEqual({ authToken: "abc", ct0: "def" });
  });
  it("null when either is missing", () => {
    expect(extractAuth("auth_token=abc")).toBeNull();
  });
});

describe("extractQueryIds", () => {
  it("scrapes both orderings without crossing operations", () => {
    const js = `a={queryId:"AAA",operationName:"Bookmarks"};b={operationName:"SearchTimeline",meta:{},queryId:"BBB"}`;
    expect(extractQueryIds(js)).toMatchObject({ Bookmarks: "AAA", SearchTimeline: "BBB" });
  });
});

const TIMELINE = {
  data: { bookmark_timeline_v2: { timeline: { instructions: [{ entries: [
    { content: { itemContent: { tweet_results: { result: {
      rest_id: "123", core: { user_results: { result: { core: { screen_name: "jane" } } } }, // new X shape: handle in user core
      legacy: { full_text: "invoices done manually = pain", favorite_count: 7 },
    } } } } },
    { content: { itemContent: { tweet_results: { result: { tweet: {
      rest_id: "456", core: { user_results: { result: { legacy: { screen_name: "bob" } } } },
      legacy: { full_text: "broken tool wasted hours", favorite_count: 3 },
    } } } } } },
  ] }] } } },
};

describe("parseTimeline", () => {
  it("walks the tree incl. the .tweet-wrapped shape, deduped", () => {
    const t = parseTimeline(TIMELINE);
    expect(t).toHaveLength(2);
    expect(t[0]).toEqual({ text: "invoices done manually = pain", handle: "jane", likes: 7, url: "https://x.com/jane/status/123" });
    expect(t[1]).toMatchObject({ handle: "bob", url: "https://x.com/bob/status/456" });
  });
  it("[] on garbage, never throws", () => {
    expect(parseTimeline(null)).toEqual([]);
  });
});

describe("graphqlError + bundleUrls", () => {
  it("surfaces an error message", () => {
    expect(graphqlError({ errors: [{ message: "nope" }] })).toBe("nope");
    expect(graphqlError({ data: {} })).toBeNull();
  });
  it("dedupes client-web bundle urls", () => {
    const html = `a "https://abs.twimg.com/responsive-web/client-web/main.x.js" b "https://abs.twimg.com/responsive-web/client-web/main.x.js"`;
    expect(bundleUrls(html)).toEqual(["https://abs.twimg.com/responsive-web/client-web/main.x.js"]);
  });
});
