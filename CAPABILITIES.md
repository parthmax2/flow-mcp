# Google Flow capabilities

What Google Flow offers and what this MCP server can do with it. Generated from `src/capabilities.ts`
(`npm run capabilities`); costs and limits as observed on a free account, October 2026.

## Account

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| Sign in (opens the Flow window and waits for the user) | `flow_sign_in` | free | free |  |
| Credit balance | `flow_credits` | free | free | Free accounts get 50 credits a day. |
| Health check (sign-in, challenges, blocks, page changes) | `flow_status` | free | free |  |

## Projects

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| List projects (with local title, purpose, uploads) | `flow_projects` | free | free |  |
| Create a titled project | `any creating tool with new_project_title` | free | free |  |
| Fresh agent session in a project | `any creating tool with new_session` | free | free | Media kept, chat memory reset. |
| Rename / delete / trash a project | not yet (Flow website only) | free | free |  |

## Chat agent

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| Talk to the Flow agent turn by turn | `flow_chat` | free | free | Returns the agent's exact reply, optional thinking, pending approvals. |
| Approve / reject a spend request | `flow_approve` | the quoted credits | free | Never picks 'Always approve'; rejects above max_credits. |
| Read a project's conversation | `flow_transcript` | free | free |  |
| Default aspect, count and model for images and videos (per project) | `flow_settings` | free | free | Flow's default image count is 2; set 1 to avoid doubles. |
| Standing agent instructions (up to 3, per project) | `flow_settings` | free | free |  |
| Approval mode (ask before spending credits) | `flow_settings` | free | free | Only 'always' can be set; chats and videos refuse to run on 'never'. |

## Images

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| Generate images (Nano Banana 2.1) | `generate_image` | free | free | Agent default is 2 images; aspect 16:9, 4:3, 1:1, 3:4, 9:16. |
| Batch: several images in parallel tabs (about 3x faster) | `generate_images` | free | free | Up to 3 tabs, each in its own agent session. |
| Edit images with an instruction | `generate_image (attachments / media_ids)` | free | free |  |
| Combine several images / faces into one | `generate_image (attachments / media_ids)` | free | free |  |
| Upscale to 2K | `flow_upscale` | free | free | 1376x768 becomes 2752x1536. |
| Upscale to 4K | `flow_upscale` | plan feature | paid (higher tiers) | Shown as locked on a free account. |
| Crop | not yet (Flow website only) | free | free |  |

## Videos

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| Text to video, Veo 3.1 Lite (8 s) | `generate_video / flow_chat` | 10 credits | free | Free tier: 8 s only for Lite. |
| Text to video, Veo 3.1 Fast / Quality | `generate_video (model)` | more credits (quoted by Flow) | free | Not tested yet. |
| Image to video: start / end frame, ingredients (references) | `generate_video (start_frame, end_frame, ingredients)` | quoted by Flow | free | Roles are numbered and explained to the agent. Start frame tested (Veo 3.1 Lite I2V, 10 credits). Veo takes frames or ingredients, not both. |
| Video-to-video edit, Omni 1.1 Flash | `generate_video (source_video)` | 20 credits at 720p | free | Output keeps the source clip's length. |
| Still frame of a video (first, last, at a time), e.g. to start the next shot on | `flow_frame` | free | free | Decoded locally in Chrome; Flow's own Save frame is not used. |
| Download at full quality (mp4) | `flow_wait / generate_video` | free | free |  |
| Upscale video (1080p / 4K) | not yet (Flow website only) | unknown | paid | Not verified on this account yet. |

## Media

| Feature | MCP tool | Cost | Plan | Notes |
|---|---|---|---|---|
| List a project's media (ids, uploaded/generated, references) | `flow_assets` | free | free |  |
| Upload local images/videos once per project and reuse | `attachments on creating tools` | free | free | Matched by content hash; rights notice confirmed on the user's behalf. |
| List download sizes for a media item | `flow_upscale (size omitted)` | free | free |  |
| Move media to the trash (preview, then confirm) | `flow_trash` | free | free | Restorable in Flow. Refuses when other media shares the workflow. |
| Find duplicate uploads (keeps the copy in use) | `flow_assets (duplicateUploads)` | free | free |  |
| Favorite / share media, restore from trash | not yet (Flow website only) | free | free |  |
| Characters: list, create from a project image, set name, notes and voice; list Flow's 30 voices | `flow_characters` | free | free |  |
| Use characters in images, videos and chat | `generate_image / generate_video / flow_chat (characters)` | images free; video quoted | free | With speech Flow picks Omni 1.1 Flash: 15 credits for 10 s (Oct 2026). |
| Scenes, Avatars, custom voices, character body views, Collections, Tools gallery | not yet (Flow website only) | varies | free | Flow website features not covered yet. |

