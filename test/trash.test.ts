import { describe, expect, it } from "vitest";
import type { Asset } from "../src/flow/assets.js";
import { alsoAffected, confirmationCode, findDuplicateUploads } from "../src/flow/trash.js";

const upload = (id: string, title: string, createdAt: number, extra: Partial<Asset> = {}): Asset => ({
  id,
  title,
  kind: "image",
  source: "uploaded",
  createdAt,
  width: 460,
  height: 460,
  ...extra,
});

describe("findDuplicateUploads", () => {
  it("keeps the oldest copy when no generated media used any of them", () => {
    const assets = [upload("c", "me.png", 3), upload("a", "me.png", 1), upload("b", "me.png", 2)];
    expect(findDuplicateUploads(assets)).toEqual([{ title: "me.png", keep: "a", extras: ["b", "c"] }]);
  });

  it("keeps every copy that generated media was made from", () => {
    const clip = { kind: "video" as const, width: 1280, height: 720, durationSeconds: 6.87 };
    const assets = [
      upload("v1", "clip", 1, clip),
      upload("v2", "clip", 2, clip),
      upload("v3", "clip", 3, clip),
      { id: "gen", title: "clip", kind: "video", source: "generated", references: ["v3"] } as Asset,
    ];
    expect(findDuplicateUploads(assets)).toEqual([{ title: "clip", keep: "v3", extras: ["v1", "v2"] }]);
  });

  it("does not group different files that share a name, or trashed copies", () => {
    const assets = [upload("a", "me.png", 1), upload("b", "me.png", 2, { width: 900 }), upload("c", "me.png", 3, { trashed: true })];
    expect(findDuplicateUploads(assets)).toEqual([]);
  });
});

describe("shared workflows", () => {
  // Shape of the fire project: a video edit shares the workflow of the uploaded clip it came from.
  const clip = { kind: "video" as const, width: 1280, height: 720, durationSeconds: 6.87 };
  const assets = [
    upload("v1", "clip", 1, { ...clip, workflowId: "w1" }),
    upload("v2", "clip", 2, { ...clip, workflowId: "w2" }),
    upload("v3", "clip", 3, { ...clip, workflowId: "w3" }),
    { id: "edit", title: "clip", kind: "video", source: "generated", workflowId: "w3", references: ["v3", "face"] } as Asset,
  ];

  it("reports what else a trash move would take along", () => {
    expect(alsoAffected(assets, ["v3"]).map((a) => a.id)).toEqual(["edit"]);
    expect(alsoAffected(assets, ["v1"])).toEqual([]);
  });

  it("keeps the copy whose workflow holds other media and offers the rest", () => {
    expect(findDuplicateUploads(assets)).toEqual([{ title: "clip", keep: "v3", extras: ["v1", "v2"] }]);
  });
});

describe("confirmationCode", () => {
  it("is the same for the same set in any order and differs for another set", () => {
    expect(confirmationCode("p", ["a", "b"])).toBe(confirmationCode("p", ["b", "a"]));
    expect(confirmationCode("p", ["a", "b"])).not.toBe(confirmationCode("p", ["a"]));
    expect(confirmationCode("p", ["a"])).not.toBe(confirmationCode("q", ["a"]));
  });
});
