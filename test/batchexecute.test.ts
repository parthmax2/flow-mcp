import { describe, expect, it } from "vitest";
import { extractMedia, parseBatchExecute } from "../src/flow/batchexecute.js";

// Shapes copied from a recorded Flow session, with ids and signatures replaced.
const MEDIA = "061867ca-0000-40dc-9f91-460bb0159b3a";
const PROJECT = "2f31fb65-0000-4021-993e-bad3afc1f7a1";
const WORKFLOW = "0f885afb-0000-4dec-9a81-b98a7d9890f0";
const FULL = `https://flow-content.google/image/${MEDIA}?Expires=1&KeyName=k&Signature=s`;
const PREVIEW = "https://lh3.googleusercontent.com/asb/preview-token";
const PROMPT = "A futuristic superbike on a neon-lit street";

const envelope = (rpcId: string, payload: unknown) =>
  `)]}'\n\n123\n${JSON.stringify([["wrb.fr", rpcId, JSON.stringify(payload), null, null, null, "generic"], ["di", 158]])}\n25\n[["e",4,null,null,421]]\n`;

const as29s = [MEDIA, PROJECT, WORKFLOW, null, null, [[1792755342, 411553000], null, null, null, null, null, [null, null, [[PROMPT]]], null, null, 1, FULL]];
const bOKtO = [[[MEDIA, PROJECT, WORKFLOW, null, null, [[1792755343, 112569000], null, null, null, null, PREVIEW, [null, null, [[PROMPT]]]]]]];

describe("parseBatchExecute", () => {
  it("unwraps wrb.fr envelopes and parses their payloads", () => {
    expect(parseBatchExecute(envelope("as29s", as29s))).toEqual([{ rpcId: "as29s", data: as29s }]);
  });

  it("ignores the XSSI prefix, length lines and non-JSON noise", () => {
    expect(parseBatchExecute(")]}'\n\n12\nnot json\n[[\"di\",1]]\n")).toEqual([]);
  });
});

describe("extractMedia", () => {
  it("reads a single media record with its creation time and prompt", () => {
    expect([...extractMedia(as29s).values()]).toEqual([{ id: MEDIA, url: FULL, kind: "image", createdAt: 1792755342, prompt: PROMPT }]);
  });

  it("finds records nested in list responses", () => {
    expect([...extractMedia(bOKtO).values()].map((m) => m.url)).toEqual([PREVIEW]);
  });

  it("prefers the full-size URL over a preview for the same media", () => {
    const merged = extractMedia(as29s, extractMedia(bOKtO));
    expect(merged.get(MEDIA)?.url).toBe(FULL);
  });

  it("marks image records as images", () => {
    expect(extractMedia(as29s).get(MEDIA)?.kind).toBe("image");
  });

  it("recognises a video by its model before the video URL exists, then takes the video URL", () => {
    const VIDEO = "f53e85dc-0000-463d-8079-9fe2e250d0cf";
    const VIDEO_URL = `https://flow-content.google/video/${VIDEO}?Expires=1&Signature=s`;
    const rendering = [VIDEO, PROJECT, WORKFLOW, null, null, [[1792757422, 176202000], "a paper boat", null, null, null, PREVIEW, [null, [["veo_3_1_t2v_lite", 1]]]]];
    const finished = [VIDEO, PROJECT, WORKFLOW, null, null, [[1792757422, 176202000], "a paper boat", null, null, null, null, [null, [["veo_3_1_t2v_lite", 1]]], null, [3], 1, `https://storage.googleapis.com/ai-sandbox-videofx/image/${VIDEO}?x=1`], null, [[null, 1, null, null, null, null, null, "<root>prompt</root>", VIDEO_URL]]];

    const seen = extractMedia(rendering);
    expect(seen.get(VIDEO)).toMatchObject({ kind: "video", model: "veo_3_1_t2v_lite", url: PREVIEW, prompt: "a paper boat" });
    expect(extractMedia(finished, seen).get(VIDEO)).toMatchObject({ kind: "video", url: VIDEO_URL });
  });

  it("replaces a video's flow-content thumbnail with its video URL once that arrives", () => {
    const EDIT = "d7cca5d9-0000-47c9-b14a-66a3399efb3a";
    const thumb = [EDIT, PROJECT, WORKFLOW, null, null, [[1792758921, 0], "a fire mage", `https://flow-content.google/image/${EDIT}?s=1`, [null, [["abra_edit", 1]]]]];
    const done = [EDIT, PROJECT, WORKFLOW, null, null, [[1792758921, 0], `https://flow-content.google/image/${EDIT}?s=1`, `https://flow-content.google/video/${EDIT}?s=2`]];
    const seen = extractMedia(thumb);
    expect(seen.get(EDIT)).toMatchObject({ kind: "video", model: "abra_edit", url: `https://flow-content.google/image/${EDIT}?s=1` });
    expect(extractMedia(done, seen).get(EDIT)?.url).toBe(`https://flow-content.google/video/${EDIT}?s=2`);
  });

  it("returns nothing for payloads without media", () => {
    expect(extractMedia([[["veo_3_1_fast", 1]]]).size).toBe(0);
  });
});
