import { describe, expect, it } from "vitest";
import { redactBody, redactHeaders, redactUrl } from "../src/capture/redact.js";

describe("redaction", () => {
  it("hides credential headers but keeps their names", () => {
    const out = redactHeaders({ Authorization: "Bearer ya29.abc", Cookie: "SID=x", "Content-Type": "application/json" });
    expect(out.Authorization).toBe("<redacted:15chars>");
    expect(out.Cookie).toMatch(/^<redacted/);
    expect(out["Content-Type"]).toBe("application/json");
  });

  it("redacts secret-looking JSON fields at any depth", () => {
    const body = JSON.stringify({ clientContext: { recaptchaToken: "03AFabc", projectId: "p1" }, prompt: "a cat" });
    expect(redactBody(body)).toEqual({
      clientContext: { recaptchaToken: "<redacted:7chars>", projectId: "p1" },
      prompt: "a cat",
    });
  });

  it("scrubs known token formats inside ordinary strings", () => {
    expect(redactBody(JSON.stringify({ note: "use ya29.a0Abc-123 now" }))).toEqual({ note: "use <redacted:oauth> now" });
  });

  it("truncates large payloads such as base64 images", () => {
    const out = redactBody(JSON.stringify({ image: "iVBO+/w".repeat(700), uri: `data:image/png;base64,${"A".repeat(500)}` })) as Record<string, string>;
    expect(out.image).toMatch(/^<truncated:base64:4900chars>/);
    expect(out.uri).toMatch(/^<truncated:base64:/);
  });

  it("redacts secret query parameters", () => {
    expect(redactUrl("https://x.googleapis.com/v1/a?key=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX&alt=json")).toBe(
      "https://x.googleapis.com/v1/a?key=%3Credacted%3E&alt=json",
    );
  });

  it("decodes batchexecute form bodies and hides the xsrf token", () => {
    const body = `f.req=${encodeURIComponent('[[["UpteDb","[\\"projects/*\\"]",null,"generic"]]]')}&at=AFfZSabc:123&`;
    expect(redactBody(body)).toEqual({
      "f.req": [[["UpteDb", ["projects/*"], null, "generic"]]],
      at: "<redacted:12chars>",
    });
  });

  it("redacts long opaque tokens inside nested RPC arrays", () => {
    const token = "0cAFcWeA" + "x".repeat(400);
    const body = `f.req=${encodeURIComponent(JSON.stringify([null, JSON.stringify(["prompt text", token])]))}`;
    expect(redactBody(body)).toEqual({ "f.req": [null, ["prompt text", "<redacted:recaptcha>"]] });
  });

  it("keeps long readable strings intact", () => {
    const text = "word ".repeat(200);
    expect(redactBody(JSON.stringify({ text }))).toEqual({ text });
  });

  it("leaves other non-JSON bodies as redacted strings", () => {
    expect(redactBody("hello world")).toBe("hello world");
    expect(redactBody(undefined)).toBeUndefined();
  });
});
