import type { ChatMessage } from "./chat.js";
import { chatTurn, decide, waitForMedia, type MediaInfo, type ProgressFn } from "./session.js";
import { serialize, type DownloadedMedia, type ProjectChoice } from "./ui.js";

/*
 * One-call video generation, composed from the turn-by-turn steps in session.ts: ask the
 * agent, approve its quote only within budget (never "Always approve", never a retry), then
 * wait for the render and download it. Every result carries what the agent said.
 */

export const VIDEO_MODELS = {
  "veo-3.1-lite": "Veo 3.1 - Lite",
  "veo-3.1-fast": "Veo 3.1 - Fast",
  "veo-3.1-quality": "Veo 3.1 - Quality",
  "omni-1.1-flash": "Omni 1.1 Flash",
} as const;
export type VideoModel = keyof typeof VIDEO_MODELS;

export interface VideoOptions extends ProjectChoice {
  prompt: string;
  model?: VideoModel;
  aspectRatio?: "16:9" | "9:16";
  /** Local images or videos to attach, e.g. a start frame or a motion reference (uploaded once per project). */
  images?: string[];
  /** The user confirmed they hold the rights to these files (Flow asks on upload). */
  confirmRights?: boolean;
  /** Media already in the project to attach. */
  mediaIds?: string[];
  /** Highest credit cost to approve. Defaults to 10, one Veo 3.1 Lite video. */
  maxCredits?: number;
  /**
   * Wait for the render after approval. Off by default: rendering takes minutes, longer than
   * many MCP clients allow a tool call, so the result is "started" and flow_wait collects it.
   */
  waitForRender?: boolean;
  /** With waitForRender: how long to wait before reporting the render as pending. */
  renderTimeoutMs?: number;
  onProgress?: ProgressFn;
}

interface Base {
  projectId: string;
  projectUrl: string;
  /** Everything said in the chat during this call, agent replies included. */
  messages: ChatMessage[];
}

export type VideoResult =
  | (Base & { status: "completed"; credits: number; files: DownloadedMedia[] })
  /** Approved and rendering; collect it with flow_wait (media ids, or since). */
  | (Base & { status: "started"; credits: number; media: MediaInfo[]; since: number })
  /** The agent replied without quoting a cost (usually a question); answer with flow_chat. */
  | (Base & { status: "needs_answer"; agentMessage: string })
  | (Base & { status: "over_budget"; credits: number; maxCredits: number; agentMessage: string })
  /** Approved and rendering, but not finished in time; fetch later with flow_wait. */
  | (Base & { status: "pending"; credits: number; media: MediaInfo[]; since: number });

export function generateVideo(options: VideoOptions): Promise<VideoResult> {
  return serialize(() => runVideo(options));
}

function composePrompt(options: VideoOptions): string {
  const parts = [options.prompt.trim()];
  if (options.model) parts.push(`Use ${VIDEO_MODELS[options.model]}.`);
  if (options.aspectRatio) parts.push(`Aspect ratio ${options.aspectRatio}.`);
  return parts.join(" ");
}

async function runVideo(options: VideoOptions): Promise<VideoResult> {
  const maxCredits = options.maxCredits ?? 10;
  const progress = options.onProgress ?? (() => {});

  progress("asking the Flow agent");
  const asked = await chatTurn({
    message: composePrompt(options),
    attachments: options.images,
    confirmRights: options.confirmRights,
    mediaIds: options.mediaIds,
    projectId: options.projectId,
    newProject: options.newProject,
    newProjectTitle: options.newProjectTitle,
    projectPurpose: options.projectPurpose,
    newSession: options.newSession,
  });
  const base = { projectId: asked.projectId, projectUrl: asked.projectUrl };
  const quote = asked.pendingApproval;
  if (!quote || quote.credits === undefined) return { ...base, messages: asked.messages, status: "needs_answer", agentMessage: asked.reply };

  progress(`Flow quoted ${quote.credits} credits (budget ${maxCredits})`);
  const decided = await decide({ projectId: asked.projectId, decision: "approve", maxCredits });
  const messages = [...asked.messages, ...decided.messages];
  if (decided.decision !== "approved") {
    return { ...base, messages, status: "over_budget", credits: quote.credits, maxCredits, agentMessage: asked.reply };
  }

  if (!options.waitForRender) {
    progress("approved; rendering in Flow");
    return { ...base, messages, status: "started", credits: quote.credits, media: decided.media, since: decided.since };
  }

  progress("approved; waiting for the render");
  const waited = await waitForMedia({
    projectId: asked.projectId,
    since: decided.since,
    ...(decided.media.length ? { mediaIds: decided.media.map((m) => m.id) } : {}),
    timeoutMs: options.renderTimeoutMs ?? 15 * 60_000,
    onProgress: progress,
  });
  const all = [...messages, ...waited.messages];
  if (waited.files.length === 0 || waited.pending.length > 0) {
    return { ...base, messages: all, status: "pending", credits: quote.credits, media: [...decided.media, ...waited.pending], since: decided.since };
  }
  return { ...base, messages: all, status: "completed", credits: quote.credits, files: waited.files };
}
