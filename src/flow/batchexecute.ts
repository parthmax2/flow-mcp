/**
 * Parsing for Google's batchexecute RPC responses, which Flow uses for everything except
 * the agent chat. A response body looks like:
 *
 *   )]}'
 *   <length>
 *   [["wrb.fr","<rpcId>","<payload as a JSON string>",null,null,null,"generic"],["di",158],...]
 *   <length>
 *   [["e",4,null,null,421]]
 */

export interface RpcResult {
  rpcId: string;
  data: unknown;
}

export function parseBatchExecute(text: string): RpcResult[] {
  const results: RpcResult[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("[")) continue;
    let envelopes: unknown;
    try {
      envelopes = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(envelopes)) continue;
    for (const env of envelopes) {
      if (!Array.isArray(env) || env[0] !== "wrb.fr" || typeof env[1] !== "string" || typeof env[2] !== "string") continue;
      try {
        results.push({ rpcId: env[1], data: JSON.parse(env[2]) });
      } catch {
        // A payload that is not JSON carries nothing we read.
      }
    }
  }
  return results;
}

export interface FlowMedia {
  id: string;
  /** Full-size download URL when known, otherwise a preview image. */
  url: string;
  kind?: "image" | "video";
  /** Generating model, e.g. veo_3_1_t2v_lite. Absent for uploads. */
  model?: string;
  /** Seconds since the epoch, as stamped by Flow when the media was created. */
  createdAt?: number;
  prompt?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FULL_VIDEO = /^https:\/\/flow-content\.google\/video\//;
const FULL_IMAGE = /^https:\/\/flow-content\.google\/image\//;
const PREVIEW = /^https:\/\/lh3\.googleusercontent\.com\//;

/** Which URL to keep for a media id: a video file beats a full image (which for a video is
 *  only its thumbnail), which beats an lh3 preview. */
const urlRank = (url: string) => (FULL_VIDEO.test(url) ? 3 : FULL_IMAGE.test(url) ? 2 : PREVIEW.test(url) ? 1 : 0);
// Video records name their model (e.g. veo_3_1_t2v_lite) even before the video URL exists.
const VIDEO_MARKER = /^https:\/\/flow-content\.google\/video\/|^(veo_|omni|abra)/;
const MODEL = /^(veo|omni|abra|beluga)[\w-]*$/;

function walk(value: unknown, visit: (s: string) => void): void {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) for (const v of value) walk(v, visit);
}

function firstTimestamp(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  const [a, b] = value;
  if (value.length === 2 && typeof a === "number" && typeof b === "number" && a > 1.5e9 && a < 4e9 && b >= 0 && b < 1e9) return a;
  for (const v of value) {
    const t = firstTimestamp(v);
    if (t !== undefined) return t;
  }
  return undefined;
}

/**
 * Finds media records in any Flow RPC payload: an array whose first element is the media
 * UUID and that contains a media URL somewhere inside. For each id the best URL seen so far
 * is kept (see urlRank), so a later response carrying the finished video replaces a thumbnail.
 */
export function extractMedia(data: unknown, into = new Map<string, FlowMedia>()): Map<string, FlowMedia> {
  if (!Array.isArray(data)) return into;
  if (typeof data[0] === "string" && UUID.test(data[0])) {
    let url: string | undefined;
    let prompt: string | undefined;
    let video = false;
    let model: string | undefined;
    walk(data, (s) => {
      if (VIDEO_MARKER.test(s)) video = true;
      if (!model && MODEL.test(s)) model = s;
      if (urlRank(s) > (url ? urlRank(url) : 0)) url = s;
      else if (!prompt && s.includes(" ") && !s.startsWith("http") && !s.startsWith("<")) prompt = s;
    });
    if (url) {
      const existing = into.get(data[0]);
      const kind = video || existing?.kind === "video" ? "video" : "image";
      if (!existing) {
        into.set(data[0], { id: data[0], url, kind, ...(model ? { model } : {}), createdAt: firstTimestamp(data), prompt });
      } else {
        if (urlRank(url) > urlRank(existing.url)) existing.url = url;
        existing.kind = kind;
        existing.model ??= model;
        existing.createdAt ??= firstTimestamp(data);
        existing.prompt ??= prompt;
      }
      return into;
    }
  }
  for (const v of data) extractMedia(v, into);
  return into;
}
