// Turn a Cookie-Editor browser export into a request Cookie header. The browser
// extension does the per-OS decryption locally; you hand x-native a plain export.

/** Cookie-Editor JSON export (`[{name,value,…}]`) → `k=v; k2=v2` header. */
export function cookieFromEditorJson(jsonText: string): string | null {
  try {
    const arr: unknown = JSON.parse(jsonText);
    if (!Array.isArray(arr)) return null;
    const pairs = arr
      .filter((c): c is { name: string; value: string } =>
        Boolean(c) && typeof (c as { name?: unknown }).name === "string" && typeof (c as { value?: unknown }).value === "string")
      .map((c) => `${c.name}=${c.value}`);
    return pairs.length ? pairs.join("; ") : null;
  } catch {
    return null;
  }
}

/** Accept either a Cookie-Editor JSON export or an already-formed cookie header. */
export function toCookieHeader(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (t.startsWith("[")) return cookieFromEditorJson(t);
  return /[^\s=]+=/.test(t) ? t.replace(/\s*\n\s*/g, " ").trim() : null;
}
