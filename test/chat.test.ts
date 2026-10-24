import { describe, expect, it } from "vitest";
import { cleanText, pendingApproval, type ChatMessage } from "../src/flow/chat.js";

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
