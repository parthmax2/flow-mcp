import { describe, expect, it } from "vitest";
import { planInputs } from "../src/flow/video.js";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("planInputs", () => {
  it("numbers inputs in attach order: local files first, then project media", () => {
    const plan = planInputs({ prompt: "p", startFrame: ID_A, endFrame: "end.png", ingredients: ["hero.png", ID_B] });
    expect(plan.files).toEqual(["end.png", "hero.png"]);
    expect(plan.mediaIds).toEqual([ID_A, ID_B]);
    expect(plan.roles).toEqual([
      "Attachment 3 is the first frame: the video opens exactly on it.",
      "Attachment 1 is the last frame: the video ends exactly on it.",
      "Attachments 2 and 4 are references (ingredients) for the characters, objects, setting or style: keep their look exactly, and do not use them as frames.",
    ]);
  });

  it("explains a source video and leaves plain attachments unexplained", () => {
    const plan = planInputs({ prompt: "p", sourceVideo: "clip.mp4", images: ["extra.png"] });
    expect(plan.files).toEqual(["clip.mp4", "extra.png"]);
    expect(plan.roles).toEqual(["Attachment 1 is the video to edit: keep its motion, timing and framing unless asked otherwise."]);
  });

  it("adds nothing without inputs", () => {
    expect(planInputs({ prompt: "p" })).toEqual({ files: [], mediaIds: [], characters: [], roles: [] });
  });

  it("numbers characters after files and media", () => {
    const plan = planInputs({ prompt: "p", characters: ["Mara", ID_B], mediaIds: [ID_A], images: ["x.png"] });
    expect(plan.characters).toEqual(["Mara", ID_B]);
    expect(plan.roles).toEqual([
      'Attachment 3 is the Flow character "Mara": keep their look exactly, and their voice when they speak.',
      "Attachment 4 is a Flow character: keep their look exactly, and their voice when they speak.",
    ]);
  });

  it("refuses a video as a frame and an image as the source", () => {
    expect(() => planInputs({ prompt: "p", startFrame: "shot.mp4" })).toThrow(/start frame must be an image/);
    expect(() => planInputs({ prompt: "p", sourceVideo: "still.png" })).toThrow(/source_video must be a video/);
  });
});
