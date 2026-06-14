import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Tiny query-id cache. The IDs rotate, so they live in a JSON file you refresh
// (heal). Override the dir with X_NATIVE_HOME or the `cacheDir` option.

export function cacheDir(dir?: string): string {
  return dir ?? process.env.X_NATIVE_HOME ?? join(homedir(), ".x-native");
}

function qidPath(dir?: string): string {
  return join(cacheDir(dir), "qids.json");
}

export function loadQids(dir?: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(qidPath(dir), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveQids(qids: Record<string, string>, dir?: string): void {
  mkdirSync(cacheDir(dir), { recursive: true });
  writeFileSync(qidPath(dir), JSON.stringify(qids, null, 2), { mode: 0o600 });
}

/** Resolve a query id: env override (X_NATIVE_QID_<OP>) → cache → null. */
export function resolveQid(op: string, dir?: string): string | null {
  return process.env[`X_NATIVE_QID_${op.toUpperCase()}`] ?? loadQids(dir)[op] ?? null;
}
