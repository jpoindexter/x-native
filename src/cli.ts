#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { searchTimeline, getBookmarks } from "./client.js";
import { refreshQueryIds } from "./heal.js";
import { toCookieHeader } from "./cookie.js";
import type { Result } from "./index.js";

// CLI. Cookie via X_COOKIE (a header or a Cookie-Editor JSON export) or
// --cookie-file <path>. Examples:
//   X_COOKIE="auth_token=…; ct0=…" x-native search "ai agents" --latest --max 30
//   x-native heal                    # scrape current query ids (pass a cookie for Bookmarks)
//   x-native bookmarks --json

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

function loadCookie(): string | null {
  const file = arg("--cookie-file");
  const raw = file ? readFileSync(file, "utf8") : process.env.X_COOKIE;
  return raw ? toCookieHeader(raw) : null;
}

function render(r: Result, label: string): void {
  if (flag("--json")) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (!r.ok) {
    console.error(`${label} failed: ${r.error}`);
    process.exitCode = 1;
    return;
  }
  if (r.tweets.length === 0) {
    console.log(`${label}: none found.`);
    return;
  }
  for (const [i, t] of r.tweets.entries()) {
    console.log(`${i + 1}. @${t.handle} (♥${t.likes}) ${t.text.replace(/\s+/g, " ").slice(0, 240)}\n   ${t.url}`);
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const max = arg("--max") ? Number(arg("--max")) : undefined;

  if (cmd === "heal") {
    const r = await refreshQueryIds({ cookie: loadCookie() ?? undefined });
    console.log(`${r.ok ? "ok" : "incomplete"}: ${r.message} (found ${r.found})`);
    return;
  }

  const cookie = loadCookie();
  if (!cookie) {
    console.error("No cookie. Set X_COOKIE (a cookie header or a Cookie-Editor JSON export) or pass --cookie-file <path>.");
    process.exitCode = 1;
    return;
  }
  if (cmd === "search") {
    const query = process.argv[3];
    if (!query) return void console.error('usage: x-native search "<query>" [--latest] [--max N] [--json]');
    render(await searchTimeline({ cookie, query, max, latest: flag("--latest") }), `search "${query}"`);
  } else if (cmd === "bookmarks") {
    render(await getBookmarks({ cookie, max }), "bookmarks");
  } else {
    console.error("usage: x-native <search|bookmarks|heal> [...]\n  search \"<query>\" [--latest] [--max N] [--json]\n  bookmarks [--max N] [--json]\n  heal");
    process.exitCode = 1;
  }
}

main();
