import { describe, expect, it } from "vitest";
import { parseAssets } from "../src/flow/assets.js";
import { uniqueName } from "../src/state/registry.js";

describe("uniqueName", () => {
  const hash = "3f9a1c2b".padEnd(64, "0");

  it("slugs the file name and adds the content hash", () => {
    expect(uniqueName("D:/ref/anime style reference.mp4", hash)).toBe("anime-style-reference-3f9a1c2b.mp4");
    expect(uniqueName("C:/x/Me.PNG", hash)).toBe("me-3f9a1c2b.png");
  });

  it("falls back to a generic name when nothing usable is left", () => {
    expect(uniqueName("C:/x/@@@.jpg", hash)).toBe("file-3f9a1c2b.jpg");
  });
});

// Shapes copied from a project's media RPC (Zzl0ze), with ids and URLs replaced.
const P = "b0046834-0000-4a97-b558-a2b50fbdc7dd";
const IMG = "060fde3c-0000-4a96-a64f-883b36a62893";
const VID = "52d274b4-0000-46dd-9c79-9dbbe5b797cd";
const GEN = "d7cca5d9-0000-47c9-b14a-66a3399efb3a";
const WF_IMG = "2f633636-0000-42ea-a64f-a43aa7be0d51";
const WF_VID = "0a6eef6a-0000-4f6f-954f-c8407b629b17";
const GENIMG = "a1a6f168-0000-4adc-9b3f-7e7527c8fe3d";
const WF_GENIMG = "9ce4bc0f-0000-44d5-9c72-d192ec216ae5";
const lh3 = (token: string) => `https://lh3.googleusercontent.com/asb/${token}`;

const payload = [
  null,
  [
    [WF_GENIMG, null, null, ["Man walking along beach", [1792766599, 0], null, null, GENIMG, "cd285c90-0000-4f2f-8d0b-2b5a7d1c9e11", [1792766625, 0]], P],
    [WF_IMG, null, null, ["me-3f9a1c2b.png", [1792758428, 0], null, null, IMG, null, [1792758435, 0]], P],
    [WF_VID, null, null, ["anime%20style%20reference", [1792758684, 0], null, null, VID, null, [1792758687, 0]], P],
  ],
  [
    [IMG, P, WF_IMG, null, null, [[1792758428, 0], null, null, null, null, lh3("ImageTokenAAAAAAAAAAAAAAAA"), [null, null, null, null, 1], null, null, 1, lh3("ImageTokenAAAAAAAAAAAAAAAA"), null, null, 68483], [null, [null, null, null, lh3("ImageTokenAAAAAAAAAAAAAAAA"), 0, null, "image/jpeg"], [460, 460]]],
    [VID, P, WF_VID, null, null, [[1792758684, 0], null, null, null, null, lh3("VideoTokenBBBBBBBBBBBBBBBB"), [null, null, null, null, 1], null, [3], 1, lh3("VideoTokenBBBBBBBBBBBBBBBB"), null, null, 2184077], null, [null, [1280, 720, [6, 870000000]]]],
    [GEN, P, WF_VID, null, null, [[1792758921, 0], "A fire mage in a cavern", null, null, null, lh3("GenTokenCCCCCCCCCCCCCCCCCCC"), [null, [["abra_edit", 1]]]], null, [null, [1280, 720, [6, 848000000]]]],
    // A generated image: no model name in the record, but a filled generation request with its reference.
    [GENIMG, P, WF_GENIMG, null, null, [[1792766599, 0], null, null, null, null, lh3("GenImgTokenDDDDDDDDDDDDDDDD"), [null, null, [["A man on a beach", null, [[["A man on a beach"]]]]], [[[null, 1, IMG]]], 1], null, null, 1, lh3("GenImgTokenDDDDDDDDDDDDDDDD"), null, null, 197355], [[null, 546203], null, [1376, 768]]],
  ],
];

describe("parseAssets", () => {
  const assets = parseAssets(payload);

  it("lists media newest first with titles from their workflows", () => {
    expect(assets.map((a) => [a.id, a.title])).toEqual([
      [GENIMG, "Man walking along beach"],
      [GEN, "anime style reference"],
      [VID, "anime style reference"],
      [IMG, "me-3f9a1c2b.png"],
    ]);
  });

  it("tells uploads from generated media and images from videos", () => {
    const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
    expect(byId[IMG]).toMatchObject({ kind: "image", source: "uploaded", width: 460, height: 460 });
    expect(byId[VID]).toMatchObject({ kind: "video", source: "uploaded", width: 1280, height: 720, durationSeconds: 6.87 });
    expect(byId[GEN]).toMatchObject({ kind: "video", source: "generated", model: "abra_edit", prompt: "A fire mage in a cavern" });
  });

  it("recognises generated images, which name no model, and lists their references", () => {
    expect(assets.find((a) => a.id === GENIMG)).toMatchObject({ kind: "image", source: "generated", references: [IMG], width: 1376, height: 768 });
    expect(assets.find((a) => a.id === IMG)?.references).toBeUndefined();
  });

  it("keeps the preview token the asset picker's thumbnails use", () => {
    expect(assets.find((a) => a.id === IMG)?.previewToken).toBe("ImageTokenAAAAAAAAAAAAAAAA");
  });

  it("returns nothing for an unexpected payload", () => {
    expect(parseAssets(null)).toEqual([]);
  });
});
