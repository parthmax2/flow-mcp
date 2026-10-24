import { describe, expect, it } from "vitest";
import { cleanText, failuresSinceLastPrompt, pendingApproval, type ChatMessage } from "../src/flow/chat.js";

describe("cleanText", () => {
  it("drops icon names and agent controls, keeping the message", () => {
    const raw = "Show thinking\narrow_forward_ios\n\nWould you like me to kick off this 1 video generation, costing 10 credits?\ncheck\nApprove\ncheck\nAlways approve\nclose\nReject\nthumb_up\nthumb_down\ncontent_copy\nflag";
    expect(cleanText(raw)).toBe("Would you like me to kick off this 1 video generation, costing 10 credits?");
  });

  it("keeps a user's own 'Approve' message", () => {
    expect(cleanText("Approve", "user")).toBe("Approve");
  });

  it("drops attachment icons from user messages", () => {
    expect(cleanText("videocam\nMake it real", "user")).toBe("Make it real");
  });
});

describe("pendingApproval", () => {
  const answered: ChatMessage = { role: "agent", text: "", approval: { question: "costing 10 credits?", credits: 10, pending: false } };
  const waiting: ChatMessage = { role: "agent", text: "", approval: { question: "costing 20 credits?", credits: 20, pending: true } };

  it("finds the approval the agent is still waiting on", () => {
    expect(pendingApproval([answered, { role: "user", text: "again" }, waiting])?.credits).toBe(20);
  });

  it("ignores approvals that were already answered", () => {
    expect(pendingApproval([answered, { role: "agent", text: "Scheduled." }])).toBeUndefined();
  });
});

describe("failuresSinceLastPrompt", () => {
  const failed: ChatMessage = { role: "agent", text: "Failed", failures: ["Failed: Something went wrong. Please try again."] };

  it("reports a failure after the latest user message, even if the agent says it is queued", () => {
    const messages: ChatMessage[] = [
      { role: "user", text: "Approve" },
      failed,
      { role: "agent", text: "Your video generation has been scheduled and is waiting in the queue." },
    ];
    expect(failuresSinceLastPrompt(messages)).toEqual(["Failed: Something went wrong. Please try again."]);
  });

  it("ignores failures from earlier requests", () => {
    expect(failuresSinceLastPrompt([{ role: "user", text: "Approve" }, failed, { role: "user", text: "Try again" }])).toEqual([]);
  });
});

describe("cleanText with character attachments", () => {
  it("drops character chip icons from user messages", () => {
    expect(cleanText("accessibility_new\naccessibility_new\nMara and Theo walk", "user")).toBe("Mara and Theo walk");
  });
});
