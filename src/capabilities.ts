/*
 * What Google Flow can do and what this MCP server covers: the single source of truth for
 * the flow_capabilities tool and CAPABILITIES.md (npm run capabilities regenerates it).
 * Costs and plan limits are as observed on a free account in October 2026.
 */

export interface Capability {
  area: "Projects" | "Chat agent" | "Images" | "Videos" | "Media" | "Account";
  feature: string;
  /** The MCP tool that does it, or null when only the Flow website can. */
  tool: string | null;
  cost: string;
  plan: "free" | "paid" | "paid (higher tiers)";
  notes?: string;
}

export const CAPABILITIES: Capability[] = [
  { area: "Account", feature: "Credit balance", tool: "flow_credits", cost: "free", plan: "free", notes: "Free accounts get 50 credits a day." },
  { area: "Account", feature: "Health check (sign-in, challenges, blocks, page changes)", tool: "flow_status", cost: "free", plan: "free" },

  { area: "Projects", feature: "List projects (with local title, purpose, uploads)", tool: "flow_projects", cost: "free", plan: "free" },
  { area: "Projects", feature: "Create a titled project", tool: "any creating tool with new_project_title", cost: "free", plan: "free" },
  { area: "Projects", feature: "Fresh agent session in a project", tool: "any creating tool with new_session", cost: "free", plan: "free", notes: "Media kept, chat memory reset." },
  { area: "Projects", feature: "Rename / delete / trash a project", tool: null, cost: "free", plan: "free" },

  { area: "Chat agent", feature: "Talk to the Flow agent turn by turn", tool: "flow_chat", cost: "free", plan: "free", notes: "Returns the agent's exact reply, optional thinking, pending approvals." },
  { area: "Chat agent", feature: "Approve / reject a spend request", tool: "flow_approve", cost: "the quoted credits", plan: "free", notes: "Never picks 'Always approve'; rejects above max_credits." },
  { area: "Chat agent", feature: "Read a project's conversation", tool: "flow_transcript", cost: "free", plan: "free" },
  { area: "Chat agent", feature: "Default aspect, count and model for images and videos (per project)", tool: "flow_settings", cost: "free", plan: "free", notes: "Flow's default image count is 2; set 1 to avoid doubles." },
  { area: "Chat agent", feature: "Standing agent instructions (up to 3, per project)", tool: "flow_settings", cost: "free", plan: "free" },
  { area: "Chat agent", feature: "Approval mode (ask before spending credits)", tool: "flow_settings", cost: "free", plan: "free", notes: "Only 'always' can be set; chats and videos refuse to run on 'never'." },

  { area: "Images", feature: "Generate images (Nano Banana 2.1)", tool: "generate_image", cost: "free", plan: "free", notes: "Agent default is 2 images; aspect 16:9, 4:3, 1:1, 3:4, 9:16." },
  { area: "Images", feature: "Edit images with an instruction", tool: "generate_image (attachments / media_ids)", cost: "free", plan: "free" },
  { area: "Images", feature: "Combine several images / faces into one", tool: "generate_image (attachments / media_ids)", cost: "free", plan: "free" },
  { area: "Images", feature: "Upscale to 2K", tool: "flow_upscale", cost: "free", plan: "free", notes: "1376x768 becomes 2752x1536." },
  { area: "Images", feature: "Upscale to 4K", tool: "flow_upscale", cost: "plan feature", plan: "paid (higher tiers)", notes: "Shown as locked on a free account." },
  { area: "Images", feature: "Crop", tool: null, cost: "free", plan: "free" },

  { area: "Videos", feature: "Text to video, Veo 3.1 Lite (8 s)", tool: "generate_video / flow_chat", cost: "10 credits", plan: "free", notes: "Free tier: 8 s only for Lite." },
  { area: "Videos", feature: "Text to video, Veo 3.1 Fast / Quality", tool: "generate_video (model)", cost: "more credits (quoted by Flow)", plan: "free", notes: "Not tested yet." },
  { area: "Videos", feature: "Image to video (start frame, references)", tool: "generate_video (attachments / media_ids)", cost: "quoted by Flow", plan: "free", notes: "Not tested yet." },
  { area: "Videos", feature: "Video-to-video edit, Omni 1.1 Flash", tool: "generate_video (attach a video)", cost: "20 credits at 720p", plan: "free", notes: "Output keeps the source clip's length." },
  { area: "Videos", feature: "Download at full quality (mp4)", tool: "flow_wait / generate_video", cost: "free", plan: "free" },
  { area: "Videos", feature: "Upscale video (1080p / 4K)", tool: null, cost: "unknown", plan: "paid", notes: "Not verified on this account yet." },

  { area: "Media", feature: "List a project's media (ids, uploaded/generated, references)", tool: "flow_assets", cost: "free", plan: "free" },
  { area: "Media", feature: "Upload local images/videos once per project and reuse", tool: "attachments on creating tools", cost: "free", plan: "free", notes: "Matched by content hash; rights notice confirmed on the user's behalf." },
  { area: "Media", feature: "List download sizes for a media item", tool: "flow_upscale (size omitted)", cost: "free", plan: "free" },
  { area: "Media", feature: "Move media to the trash (preview, then confirm)", tool: "flow_trash", cost: "free", plan: "free", notes: "Restorable in Flow. Refuses when other media shares the workflow." },
  { area: "Media", feature: "Find duplicate uploads (keeps the copy in use)", tool: "flow_assets (duplicateUploads)", cost: "free", plan: "free" },
  { area: "Media", feature: "Favorite / share media, restore from trash", tool: null, cost: "free", plan: "free" },
  { area: "Media", feature: "Characters, Scenes, Voices, Avatars, Collections, Tools gallery", tool: null, cost: "varies", plan: "free", notes: "Flow website features not covered yet." },
];

export function capabilitiesMarkdown(): string {
  const lines = [
    "# Google Flow capabilities",
    "",
    "What Google Flow offers and what this MCP server can do with it. Generated from `src/capabilities.ts`",
    "(`npm run capabilities`); costs and limits as observed on a free account, October 2026.",
    "",
  ];
  for (const area of [...new Set(CAPABILITIES.map((c) => c.area))]) {
    lines.push(`## ${area}`, "", "| Feature | MCP tool | Cost | Plan | Notes |", "|---|---|---|---|---|");
    for (const c of CAPABILITIES.filter((x) => x.area === area)) {
      lines.push(`| ${c.feature} | ${c.tool ? `\`${c.tool}\`` : "not yet (Flow website only)"} | ${c.cost} | ${c.plan} | ${c.notes ?? ""} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("capabilities.ts")) {
  const { writeFileSync } = await import("node:fs");
  const { PROJECT_ROOT } = await import("./config.js");
  const { join } = await import("node:path");
  writeFileSync(join(PROJECT_ROOT, "CAPABILITIES.md"), capabilitiesMarkdown() + "\n");
  console.log("Wrote CAPABILITIES.md");
}
