import type { Request } from "playwright-core";
import { tapRpcs } from "../browser/rpc.js";
import { getFlowPage } from "../browser/connect.js";
import { attachInputs, type AttachedInputs } from "./assets.js";
import { extractMedia, parseBatchExecute, type FlowMedia } from "./batchexecute.js";
import { readTranscript, type ChatMessage } from "./chat.js";
import { clearPrompt, download, openProject, sendPrompt, serialize, type DownloadedMedia, type ProjectChoice } from "./ui.js";
import { checkUploadable } from "./upload.js";

/*
 * Image generation and editing through the Flow agent chat. Images cost no credits, so the
 * agent generates without asking; results are read from the page's RPC responses.
 */

const STREAM_CHAT = /FlowCreationAgentService\/StreamChat/;
const MEDIA_RPCS = new Set(["bOKtO", "as29s"]);
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
  timeoutMs?: number;
  /** How long to keep collecting after the agent finishes and results stop arriving. */
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
  return serialize(() => runGeneration(options));
}

async function runGeneration(options: GenerateOptions): Promise<GenerateResult> {
  const timeoutMs = options.timeoutMs ?? 240_000;
  const settleMs = options.settleMs ?? 8_000;
  options.images?.forEach(checkUploadable);
  const page = await getFlowPage();
  await page.bringToFront();
  const projectId = await openProject(page, options);
  await clearPrompt(page);
  const attached = await attachInputs(page, projectId, { files: options.images, mediaIds: options.mediaIds, confirmRights: options.confirmRights });
  const inputs = new Set(attached.mediaIds);
  const before = (await readTranscript(page)).length;

  const media = new Map<string, FlowMedia>();
  let lastNewMediaAt = 0;
  let chatDone = false;
  let chatError: string | undefined;
  const startedAt = Date.now() / 1000 - CLOCK_SKEW_S;

  const tap = await tapRpcs(
    page,
    (_, body) => {
      for (const { data } of parseBatchExecute(body)) {
        for (const m of extractMedia(data).values()) {
          if (m.kind === "video" || inputs.has(m.id) || (m.createdAt !== undefined && m.createdAt < startedAt)) continue;
          if (!media.has(m.id)) lastNewMediaAt = Date.now();
          const prev = media.get(m.id);
          if (!prev || prev.url !== m.url) media.set(m.id, m);
        }
      }
    },
    MEDIA_RPCS,
  );
  const onChatEnd = (req: Request) => {
    if (!STREAM_CHAT.test(req.url())) return;
    chatDone = true;
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
      await page.waitForTimeout(1000);
      if (chatError) throw new Error(`Flow agent request failed: ${chatError}`);
      const settled = media.size > 0 && Date.now() - lastNewMediaAt > settleMs;
      if (chatDone && settled) break;
    }
    if (media.size === 0) {
      throw new Error(
        chatDone
          ? "The Flow agent finished without producing media. Check the chat in the Flow window for its reply."
          : `No media arrived within ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
  } finally {
    await tap.stop();
    page.off("requestfinished", onChatEnd);
    page.off("requestfailed", onChatEnd);
  }

  const files = await download(page, [...media.values()]);
  const messages = (await readTranscript(page)).slice(before);
  const reply = messages
    .filter((m) => m.role === "agent")
    .map((m) => m.text)
    .join("\n\n");
  return { projectId, projectUrl: page.url(), ...(attached.mediaIds.length ? { inputs: attached } : {}), files, reply, messages };
}
