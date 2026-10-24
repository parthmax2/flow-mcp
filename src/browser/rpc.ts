import type { Page } from "playwright-core";

/*
 * Reads Flow's batchexecute responses straight from Chrome's DevTools protocol.
 *
 * Flow's page navigates on right after loading, and Playwright then refuses to return bodies
 * of responses from before that point ("navigated away"), although Chrome still has them.
 * A dedicated CDP session keeps its own network buffer and reads every body as it finishes.
 */

export interface RpcTap {
  stop(): Promise<void>;
}

export type RpcHandler = (rpcId: string, body: string) => void;

export async function tapRpcs(page: Page, onBody: RpcHandler, only?: ReadonlySet<string>): Promise<RpcTap> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable", { maxTotalBufferSize: 64_000_000, maxResourceBufferSize: 16_000_000 });
  const inFlight = new Map<string, string>();

  // Requests are registered when sent: keying on the response event misses some of Flow's calls.
  cdp.on("Network.requestWillBeSent", (e) => {
    let rpc: string | null = null;
    try {
      rpc = new URL(e.request.url).searchParams.get("rpcids");
    } catch {
      return;
    }
    if (rpc && (!only || only.has(rpc))) inFlight.set(e.requestId, rpc);
  });
  cdp.on("Network.responseReceived", (e) => {
    if (e.response.status >= 400) inFlight.delete(e.requestId);
  });
  cdp.on("Network.loadingFinished", async (e) => {
    const rpc = inFlight.get(e.requestId);
    if (!rpc) return;
    inFlight.delete(e.requestId);
    try {
      const { body, base64Encoded } = await cdp.send("Network.getResponseBody", { requestId: e.requestId });
      onBody(rpc, base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body);
    } catch (err) {
      // Evicted or cancelled; Flow repeats the calls that matter.
      if (process.env.FLOW_DEBUG_RPC) console.error(`[rpc] ${rpc} body unavailable: ${String(err).slice(0, 120)}`);
    }
  });
  cdp.on("Network.loadingFailed", (e) => {
    if (process.env.FLOW_DEBUG_RPC && inFlight.has(e.requestId)) console.error(`[rpc] ${inFlight.get(e.requestId)} failed: ${e.errorText}`);
    inFlight.delete(e.requestId);
  });

  return { stop: () => cdp.detach().catch(() => {}) };
}

/**
 * Flow's read-only data calls that the tool may send itself: the project's media list, the
 * project list and the credit balance. Anything that creates, changes or spends goes through
 * Flow's own UI instead.
 */
const READ_ONLY_RPCS = new Set(["Zzl0ze", "UpteDb", "nzlxg"]);

/**
 * Sends one of Flow's read-only data calls from inside the signed-in Flow tab, exactly as the
 * page does (same session token and parameters), and returns the raw response. This avoids
 * reloading the page to get data, which Flow sometimes cancels during its own navigation.
 */
export async function callRpc(page: Page, rpcId: string, args: unknown): Promise<string> {
  if (!READ_ONLY_RPCS.has(rpcId)) throw new Error(`${rpcId} is not an allowed read-only call`);
  const sourcePath = new URL(page.url()).pathname;
  // Plain script text, so the TypeScript loader's helpers are not injected into the page.
  const script = `(async (rpcId, args, sourcePath) => {
    const w = window.WIZ_global_data;
    if (!w || !w.SNlM0e) throw new Error("The Flow page is not ready");
    const params = new URLSearchParams({
      rpcids: rpcId, "source-path": sourcePath, bl: w.cfb2h, "f.sid": w.FdrFJe,
      hl: document.documentElement.lang || "en", _reqid: String(100000 + Math.floor(Math.random() * 900000)), rt: "c",
    });
    const body = new URLSearchParams({ "f.req": JSON.stringify([[[rpcId, JSON.stringify(args), null, "generic"]]]), at: w.SNlM0e });
    const res = await fetch("/_/AiSandboxAngularFrontend/data/batchexecute?" + params, {
      method: "POST", credentials: "include", body,
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-same-domain": "1" },
    });
    if (!res.ok) throw new Error(rpcId + " failed with HTTP " + res.status);
    return await res.text();
  })`;
  return (await page.evaluate(`${script}(${JSON.stringify(rpcId)}, ${JSON.stringify(args)}, ${JSON.stringify(sourcePath)})`)) as string;
}
