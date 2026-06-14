import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookieFromEditorJson, toCookieHeader } from "./cookie.js";
import { loadQids, saveQids, resolveQid } from "./cache.js";
import { searchTimeline, getBookmarks } from "./client.js";
import { refreshQueryIds } from "./heal.js";

describe("cookie helpers", () => {
  it("Cookie-Editor JSON → header", () => {
    expect(cookieFromEditorJson('[{"name":"auth_token","value":"a"},{"name":"ct0","value":"b"}]')).toBe("auth_token=a; ct0=b");
  });
  it("toCookieHeader accepts JSON or a header, rejects junk", () => {
    expect(toCookieHeader("auth_token=a; ct0=b")).toBe("auth_token=a; ct0=b");
    expect(toCookieHeader("[]")).toBeNull();
    expect(toCookieHeader("nonsense")).toBeNull();
  });
});

describe("cache + client + heal (temp dir, mocked network)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "xn-"));
    process.env.X_NATIVE_HOME = dir;
  });
  afterEach(() => {
    delete process.env.X_NATIVE_HOME;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("qid cache round-trips + env override wins", () => {
    saveQids({ Bookmarks: "C1" });
    expect(loadQids()).toEqual({ Bookmarks: "C1" });
    expect(resolveQid("Bookmarks")).toBe("C1");
    process.env.X_NATIVE_QID_BOOKMARKS = "ENV1";
    expect(resolveQid("Bookmarks")).toBe("ENV1");
    delete process.env.X_NATIVE_QID_BOOKMARKS;
  });

  it("client needs a cookie + a query id", async () => {
    const noAuth = await searchTimeline({ cookie: "junk=1", query: "x" });
    expect(noAuth.ok).toBe(false);
    const noQid = await getBookmarks({ cookie: "auth_token=a; ct0=b" });
    expect(noQid.ok).toBe(false);
    if (!noQid.ok) expect(noQid.error).toContain("x-native heal");
  });

  it("client returns parsed tweets on success (mocked)", async () => {
    saveQids({ Bookmarks: "Q" });
    const timeline = { data: { x: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: {
      rest_id: "9", core: { user_results: { result: { legacy: { screen_name: "me" } } } }, legacy: { full_text: "saved", favorite_count: 1 },
    } } } } }] }] } } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => timeline })));
    const r = await getBookmarks({ cookie: "auth_token=a; ct0=b" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tweets[0]).toMatchObject({ handle: "me", url: "https://x.com/me/status/9" });
  });

  it("heal crawls two levels into a bundle holding Bookmarks (mocked)", async () => {
    const byUrl: Record<string, string> = {
      "https://x.com/": `<script src="https://abs.twimg.com/responsive-web/client-web/main.x.js"></script>`,
      "https://abs.twimg.com/responsive-web/client-web/main.x.js": `load("https://abs.twimg.com/responsive-web/client-web/route.y.js");queryId:"Q_ST",operationName:"SearchTimeline"`,
      "https://abs.twimg.com/responsive-web/client-web/route.y.js": `queryId:"Q_BM",operationName:"Bookmarks"`,
    };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => ({ ok: true, text: async () => byUrl[u] ?? "" })));
    const r = await refreshQueryIds({ cookie: "auth_token=a; ct0=b" });
    expect(r.ok).toBe(true);
    expect(loadQids()).toMatchObject({ SearchTimeline: "Q_ST", Bookmarks: "Q_BM" });
  });
});
