import type { Page, Request } from "playwright-core";
import { tapRpcs } from "../browser/rpc.js";
import { getFlowPage, openFlowTab } from "../browser/connect.js";
import { attachInputs, ensureUploaded, type AttachedInputs } from "./assets.js";
import { attachCharacters } from "./characters.js";
import { extractMedia, parseBatchExecute, type FlowMedia } from "./batchexecute.js";
import { readTranscript, type ChatMessage } from "./chat.js";
import { clearPrompt, download, openProject, sendPrompt, serialize, type DownloadedMedia, type ProjectChoice } from "./ui.js";
import { checkUploadable } from "./upload.js";

/*
 * Image generation and editing through the Flow agent chat. Images cost no credits, so the
 * agent generates without asking; results are read from the page's RPC responses.
 */

const STREAM_CHAT = /FlowCreationAgentService\/StreamChat/;
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
  return serialize(async () => runGeneration(await getFlowPage(), options, false));
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
    chatDoneAt ||= Date.now();
    const failure = req.failure()?.errorText;
    // Flow closes the stream itself when the agent finishes, which reports as an abort.
    if (failure && !/ABORTED/.test(failure)) chatError = failure;
  };

  page.on("requestfinished", onChatEnd);
  page.on("requestfailed", onChatEnd);
  try {
    await sendPrompt(page, options.prompt);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      if (chatError) throw new Error(`Flow agent request failed: ${chatError}`);
      if (!chatDoneAt) continue;
      const found = results();
      // Done as soon as every result has its full-size file and nothing changed for a moment;
      // otherwise give the full-size URLs up to settleMs after the agent finished.
      const allFull = found.length > 0 && found.every((m) => FULL_IMAGE.test(m.url));
      if (allFull && Date.now() - lastChangeAt > 1_500) break;
      if (found.length > 0 && Date.now() - chatDoneAt > settleMs) break;
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

  const files = await download(page, results());
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
    const worker = async (tab: Page) => {
      while (next < jobs.length) {
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
            if (!/without producing media/.test(error)) break;
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
    return results;
  });
}
