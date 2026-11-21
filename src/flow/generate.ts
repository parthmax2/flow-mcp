import { healed, step } from "../jobs.js";
import type { Page, Request } from "playwright-core";
import { tapRpcs } from "../browser/rpc.js";
import { getFlowPage, openFlowTab } from "../browser/connect.js";
import { attachInputs, ensureUploaded, type AttachedInputs } from "./assets.js";
import { attachCharacters } from "./characters.js";
import { extractMedia, parseBatchExecute, type FlowMedia, IMAGE_PREVIEW } from "./batchexecute.js";
import { AGENT_QUOTA_HELP, AgentQuotaError, assertNoNewQuotaNotice, forgetQuotaIfOver, quotaNotices, readTranscript, type ChatMessage } from "./chat.js";
import { clearPrompt, download, openProject, sendPrompt, serialize, type DownloadedMedia, type ProjectChoice } from "./ui.js";
import { checkUploadable } from "./upload.js";

/*
 * Image generation and editing through the Flow agent chat. Images cost no credits, so the
 * agent generates without asking; results are read from the page's RPC responses.
 */

// The chat stream's address; Flow moved it in November 2026 ("flowCreationAgent/streamCreationAgentChat/channel").
// Only failures on it are read from the network: the end of the agent's turn comes from the panel.
const STREAM_CHAT = /FlowCreationAgentService\/StreamChat|flowCreationAgent\/streamCreationAgentChat/;
// bOKtO lists the media of the chat's own results; as29s carries full-size URLs of any media shown.
const CHAT_MEDIA_RPC = "bOKtO";
const MEDIA_RPCS = new Set([CHAT_MEDIA_RPC, "as29s"]);
const FULL_IMAGE = /^https:\/\/flow-content\.google\/image\//;
// Flow stamps media with server time; allow for clock skew against this machine.
export const CLOCK_SKEW_S = 15;

export interface GenerateOptions extends ProjectChoice {
  prompt: string;
  /** Local images to attach, e.g. a photo to edit (uploaded once per project, then reused). */
  images?: string[];
  /** The user confirmed they hold the rights to these files (Flow asks on upload). */
  confirmRights?: boolean;
  /** Media already in the project to attach. */
  mediaIds?: string[];
  /** Flow characters to attach after the media, by name or id. */
  characters?: string[];
  timeoutMs?: number;
  /** Longest wait for full-size files after the agent has finished. */
  settleMs?: number;
}

export type GeneratedFile = DownloadedMedia;

export interface GenerateResult {
  projectId: string;
  projectUrl: string;
  /** What was attached, and which local files had to be uploaded versus were reused. */
  inputs?: AttachedInputs;
  files: GeneratedFile[];
  /** What the agent said while making them (it often rewrites the prompt or explains choices). */
  reply: string;
  messages: ChatMessage[];
}

export function generate(options: GenerateOptions): Promise<GenerateResult> {
  return serialize(async () => {
    const page = await getFlowPage();
    try {
      return await runGeneration(page, options, false);
    } catch (err) {
      // Images are free, so an agent that finished without making one gets a second try in a fresh
      // session (as the batch does). A policy message is not retried: the same words are refused again.
      const message = err instanceof Error ? err.message : String(err);
      if (!/finished without producing media/.test(message) || /polic|violat|safety/i.test(message)) throw err;
      healed("Flow's agent made no image; trying once more");
      return runGeneration(page, { ...options, newSession: true }, false);
    }
  });
}

/**
 * Runs one request in the given tab. With chatOnly, only media that this tab's chat lists
 * counts as a result: other tabs working in the same project show their media too.
 */
async function runGeneration(page: Page, options: GenerateOptions, chatOnly: boolean): Promise<GenerateResult> {
  const timeoutMs = options.timeoutMs ?? 240_000;
  const settleMs = options.settleMs ?? 15_000;
  options.images?.forEach(checkUploadable);
  await page.bringToFront();
  const projectId = await openProject(page, options);
  await clearPrompt(page);
  const attached = await attachInputs(page, projectId, { files: options.images, mediaIds: options.mediaIds, confirmRights: options.confirmRights });
  const characters = await attachCharacters(page, options.characters ?? []);
  // A character's own reference images come back with the results; they are inputs, not results.
  const inputs = new Set([...attached.mediaIds, ...characters.flatMap((c) => c.imageIds)]);
  const before = (await readTranscript(page)).length;
  const quotaBefore = await quotaNotices(page);

  const media = new Map<string, FlowMedia>();
  const fromChat = new Set<string>();
  let lastChangeAt = 0;
  let chatDoneAt = 0;
  let chatError: string | undefined;
  const startedAt = Date.now() / 1000 - CLOCK_SKEW_S;

  const tap = await tapRpcs(
    page,
    (rpc, body) => {
      for (const { data } of parseBatchExecute(body)) {
        for (const m of extractMedia(data).values()) {
          if (m.kind === "video" || inputs.has(m.id) || (m.createdAt !== undefined && m.createdAt < startedAt)) continue;
          if (rpc === CHAT_MEDIA_RPC) fromChat.add(m.id);
          const prev = media.get(m.id);
          if (!prev || prev.url !== m.url) {
            media.set(m.id, m);
            lastChangeAt = Date.now();
          }
        }
      }
    },
    MEDIA_RPCS,
  );
  const results = () => [...media.values()].filter((m) => !chatOnly || fromChat.has(m.id));
  const onChatEnd = (req: Request) => {
    if (!STREAM_CHAT.test(req.url())) return;
    const failure = req.failure()?.errorText;
    // Flow closes the stream itself when the agent finishes, which reports as an abort.
    if (failure && !/ABORTED/.test(failure)) chatError = failure;
  };

  page.on("requestfinished", onChatEnd);
  page.on("requestfailed", onChatEnd);
  try {
    step("Sending the prompt to Flow's agent", { icon: "✍️" });
    await sendPrompt(page, options.prompt);
    const sentAt = Date.now();
    // The agent is working while its panel shows Stop; Stop disappearing is the end of its turn.
    const stop = page.locator("flow-agent-panel").getByRole("button", { name: "Stop", exact: true });
    let stopSeen = false;
    const deadline = Date.now() + timeoutMs;
    let reloaded = false;
    let repliedLogged = false;
    let madeLogged = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      if (chatError) throw new Error(`Flow agent request failed: ${chatError}`);
      // The call returns only after the agent's turn has ended (below). Returning as soon as the image
      // existed saved about 2.5 s but left some images with a viewer that stays blank (2 of 6 in a controlled
      // test, against 0 of 12 when waiting), so they could not be opened, edited or upscaled in Flow.
      if (!chatDoneAt) {
        if (await stop.isVisible().catch(() => false)) stopSeen = true;
        else if (stopSeen || Date.now() - sentAt > 20_000) chatDoneAt = Date.now();
        if (!chatDoneAt) continue;
      }
      if (!repliedLogged) {
        repliedLogged = true;
        step("Flow's agent replied", { icon: "💬" });
      }
      const found = results();
      if (found.length > 0 && !madeLogged) {
        madeLogged = true;
        step(`Flow made ${found.length} image${found.length === 1 ? "" : "s"}; fetching`, { icon: "🖼️" });
      }
      if (found.length === 0) await assertNoNewQuotaNotice(page, quotaBefore);
      // Done as soon as every result has its full-size file and nothing changed for a moment;
      // otherwise give the full-size URLs up to settleMs after the agent finished.
      // A preview link is as good as a full-size one: fullImageUrl() turns it into the original when downloading.
      const allFull = found.length > 0 && found.every((m) => FULL_IMAGE.test(m.url) || IMAGE_PREVIEW.test(m.url));
      if (allFull && Date.now() - lastChangeAt > 600) break;
      if (found.length > 0 && Date.now() - chatDoneAt > settleMs) {
        // Some tabs (often the last of a batch) only ever get the small preview. Reloading makes
        // Flow fetch the project's media again, full-size links included, before giving up.
        if (reloaded) break;
        reloaded = true;
        chatDoneAt = Date.now();
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
      if (found.length === 0 && Date.now() - chatDoneAt > 30_000) break;
    }
    if (results().length === 0) {
      const said = (await readTranscript(page).catch(() => [])).slice(before).filter((m) => m.role === "agent").map((m) => m.text).join(" / ");
      throw new Error(
        chatDoneAt
          ? `The Flow agent finished without producing media.${said ? ` It said: "${said.slice(0, 400)}"` : " It said nothing."}`
          : `No media arrived within ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
  } finally {
    await tap.stop();
    page.off("requestfinished", onChatEnd);
    page.off("requestfailed", onChatEnd);
  }

  const files = await download(page, projectId, results());
  await forgetQuotaIfOver(page);
  const messages = (await readTranscript(page)).slice(before);
  const reply = messages
    .filter((m) => m.role === "agent")
    .map((m) => m.text)
    .join("\n\n");
  return { projectId, projectUrl: page.url(), ...(attached.mediaIds.length ? { inputs: attached } : {}), files, reply, messages };
}

export interface BatchJob {
  prompt: string;
  /** Local images to attach (uploaded once for the whole batch). */
  images?: string[];
  mediaIds?: string[];
  characters?: string[];
}

export type BatchResult = { index: number; prompt: string } & ({ ok: true; result: GenerateResult } | { ok: false; error: string });

/**
 * Runs several image requests at once in separate Flow tabs of one project, each in its own
 * agent session so the conversations stay apart. Shared files are uploaded once beforehand.
 */
export function generateBatch(
  jobs: BatchJob[],
  options: ProjectChoice & { parallel?: number; confirmRights?: boolean; onProgress?: (message: string) => void },
): Promise<BatchResult[]> {
  return serialize(async () => {
    const parallel = Math.max(1, Math.min(options.parallel ?? 3, 3, jobs.length));
    const main = await getFlowPage();
    const projectId = await openProject(main, options);

    // Upload every distinct file once, then let each job attach it by media id.
    const files = [...new Set(jobs.flatMap((j) => j.images ?? []))];
    files.forEach(checkUploadable);
    const uploaded = files.length ? await ensureUploaded(main, projectId, files, options.confirmRights) : undefined;
    const idOf = new Map(files.map((f, i) => [f, uploaded!.mediaIds[i]]));

    const results: BatchResult[] = new Array(jobs.length);
    let next = 0;
    // The daily agent limit applies to every tab, so the first job that hits it stops the rest.
    let quotaReached = false;
    const worker = async (tab: Page) => {
      while (next < jobs.length && !quotaReached) {
        const index = next++;
        const job = jobs[index];
        options.onProgress?.(`started ${index + 1}/${jobs.length}`);
        const mediaIds = [...(job.images ?? []).map((f) => idOf.get(f)!), ...(job.mediaIds ?? [])];
        // Images are free, so a job that came back empty gets one more try in a fresh session.
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const result = await runGeneration(tab, { prompt: job.prompt, mediaIds, characters: job.characters, projectId, newSession: true }, true);
            results[index] = { index, prompt: job.prompt, ok: true, result };
            break;
          } catch (err) {
            const error = err instanceof Error ? err.message.split("\n")[0] : String(err);
            results[index] = { index, prompt: job.prompt, ok: false, error };
            if (err instanceof AgentQuotaError) quotaReached = true;
            if (quotaReached || !/without producing media/.test(error)) break;
          }
        }
        options.onProgress?.(`finished ${results.filter(Boolean).length}/${jobs.length}`);
      }
    };

    const tabs = [main, ...(await Promise.all(Array.from({ length: parallel - 1 }, () => openFlowTab())))];
    try {
      await Promise.all(tabs.map((tab) => worker(tab)));
    } finally {
      await Promise.all(tabs.slice(1).map((tab) => tab.close().catch(() => {})));
    }
    for (let index = 0; index < jobs.length; index++) {
      results[index] ??= { index, prompt: jobs[index].prompt, ok: false, error: `Not started: ${AGENT_QUOTA_HELP}` };
    }
    return results;
  });
}
