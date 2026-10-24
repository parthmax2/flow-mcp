import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { redactBody, redactHeaders, redactUrl } from "./redact.js";

export interface CapturedRequest {
  seq: number;
  startedAt: string;
  type: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  status?: number;
  mimeType?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
}

const API_TYPES = new Set(["Fetch", "XHR", "EventSource", "Other", "Ping"]);
const MAX_BODY_BYTES = 2_000_000;
const STREAMING_URL = /\/Stream\w*(\?|$)/;

/**
 * Records the API traffic of one tab through CDP while the user works in it, and saves
 * the page's own JS bundles so they can be statically analysed (e.g. with REA).
 */
export class Recorder {
  private cdp?: CDPSession;
  private readonly requests = new Map<string, CapturedRequest>();
  private readonly bundles = new Map<string, string>();
  // Streaming responses (e.g. the Flow agent's StreamChat) have no retrievable body once
  // finished, so their chunks are collected as they arrive.
  private readonly streams = new Map<string, Buffer[]>();
  private seq = 0;

  constructor(
    private readonly page: Page,
    private readonly outDir: string,
  ) {}

  async start(): Promise<void> {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.cdp.send("Network.enable", { maxPostDataSize: MAX_BODY_BYTES });

    this.cdp.on("Network.requestWillBeSent", (e) => {
      if (e.type === "Script") this.bundles.set(e.requestId, e.request.url);
      if (!API_TYPES.has(e.type ?? "Other")) return;
      this.requests.set(e.requestId, {
        seq: ++this.seq,
        startedAt: new Date().toISOString(),
        type: e.type ?? "Other",
        method: e.request.method,
        url: redactUrl(e.request.url),
        requestHeaders: redactHeaders(e.request.headers),
        requestBody: redactBody(e.request.postData),
      });
      if (STREAMING_URL.test(e.request.url)) {
        this.streams.set(e.requestId, []);
        this.cdp!.send("Network.streamResourceContent", { requestId: e.requestId })
          .then(({ bufferedData }) => {
            if (bufferedData) this.streams.get(e.requestId)?.unshift(Buffer.from(bufferedData, "base64"));
          })
          .catch(() => this.streams.delete(e.requestId));
      }
    });

    this.cdp.on("Network.dataReceived", (e) => {
      if (e.data) this.streams.get(e.requestId)?.push(Buffer.from(e.data, "base64"));
    });

    this.cdp.on("Network.responseReceived", (e) => {
      const r = this.requests.get(e.requestId);
      if (!r) return;
      r.status = e.response.status;
      r.mimeType = e.response.mimeType;
      r.responseHeaders = redactHeaders(e.response.headers);
    });

    this.cdp.on("Network.loadingFinished", async (e) => {
      const r = this.requests.get(e.requestId);
      const bundleUrl = this.bundles.get(e.requestId);
      const chunks = this.streams.get(e.requestId);
      if (r && chunks?.length) {
        r.responseBody = redactBody(Buffer.concat(chunks).toString("utf8"));
        this.streams.delete(e.requestId);
        return;
      }
      if (!r && !bundleUrl) return;
      try {
        const { body, base64Encoded } = await this.cdp!.send("Network.getResponseBody", { requestId: e.requestId });
        if (bundleUrl) this.saveBundle(bundleUrl, base64Encoded ? Buffer.from(body, "base64").toString() : body);
        if (r) r.responseBody = base64Encoded ? `<binary:${body.length}b64chars>` : redactBody(body);
      } catch {
        // Bodies of redirects and evicted responses are unavailable; the metadata is still useful.
      }
    });

    this.cdp.on("Network.loadingFailed", (e) => {
      const r = this.requests.get(e.requestId);
      if (r) r.error = e.errorText;
    });
  }

  private saveBundle(url: string, source: string): void {
    const u = new URL(url);
    const name = `${u.host}${u.pathname}`.replace(/[^\w.-]+/g, "_").slice(-150);
    const dir = path.join(this.outDir, "bundles");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name.endsWith(".js") ? name : `${name}.js`), source);
  }

  async stop(): Promise<string> {
    await this.cdp?.detach().catch(() => {});
    mkdirSync(this.outDir, { recursive: true });
    const file = path.join(this.outDir, "requests.json");
    const list = [...this.requests.values()].sort((a, b) => a.seq - b.seq);
    writeFileSync(file, JSON.stringify(list, null, 2));
    return file;
  }

  get count(): number {
    return this.requests.size;
  }
}
