/**
 * Captures are meant to be read and committed for analysis, so anything that would let
 * someone act as the account is replaced with a placeholder that keeps its shape.
 */

const SECRET_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-goog-authuser",
  "x-client-data",
  "x-browser-validation",
  "proxy-authorization",
]);

const SECRET_KEY = /token|recaptcha|captcha|cookie|auth|secret|session|password|credential|sapisid/i;

const SECRET_VALUE_PATTERNS: [RegExp, string][] = [
  [/ya29\.[\w.-]+/g, "<redacted:oauth>"],
  [/AIza[\w-]{30,}/g, "<redacted:apikey>"],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<redacted:jwt>"],
  [/\b0[3-9a-z]A[\w-]{100,}/g, "<redacted:recaptcha>"],
  // Unbroken opaque runs this long are tokens or encoded blobs, never readable structure.
  [/[\w-]{300,}/g, "<redacted:opaque>"],
];

const MAX_STRING = 200_000;

export function redactString(value: string): string {
  let out = value;
  for (const [re, placeholder] of SECRET_VALUE_PATTERNS) out = out.replace(re, placeholder);
  if (out.startsWith("data:") || /^[A-Za-z0-9+/=]{200,}$/.test(out)) {
    return `<truncated:base64:${out.length}chars> ${out.slice(0, 40)}`;
  }
  return out.length > MAX_STRING ? `<truncated:string:${out.length}chars> ${out.slice(0, MAX_STRING)}` : out;
}

/** Google RPC payloads nest JSON inside strings; expand them so their fields get redacted too. */
function parseNested(value: string): unknown {
  const t = value.trimStart();
  if (!(t.startsWith("[") || t.startsWith("{"))) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? `<redacted:${v.length}chars>` : redactString(v);
  }
  return out;
}

export function redactJson(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (SECRET_KEY.test(key) && value.length > 0) return `<redacted:${value.length}chars>`;
    const nested = parseNested(value);
    return nested === undefined ? redactString(value) : redactJson(nested, key);
  }
  if (Array.isArray(value)) return value.map((v) => redactJson(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactJson(v, k)]));
  }
  return value;
}

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const k of [...url.searchParams.keys()]) {
      if (SECRET_KEY.test(k) || k === "key") url.searchParams.set(k, "<redacted>");
    }
    return redactString(url.toString());
  } catch {
    return redactString(raw);
  }
}

// Google's batchexecute posts `f.req=<json>&at=<xsrf token>` as a form body.
const SECRET_FORM_KEYS = new Set(["at"]);

function redactForm(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(body)) {
    if (SECRET_FORM_KEYS.has(k) || SECRET_KEY.test(k)) out[k] = `<redacted:${v.length}chars>`;
    else out[k] = redactBody(v);
  }
  return out;
}

/** Parses a body as JSON or a form when possible so redaction can work per field. */
export function redactBody(body: string | undefined): unknown {
  if (body === undefined) return undefined;
  try {
    return redactJson(JSON.parse(body));
  } catch {
    if (/^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*&?$/.test(body)) return redactForm(body);
    return redactString(body);
  }
}
