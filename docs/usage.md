# Using flow-mcp

Ask your assistant in plain words:

```text
make an image of a lighthouse at dusk
edit my photo C:\photos\me.jpg into a winter scene
make an 8 second video of a paper boat, max 10 credits
```

While it works, a Chrome window shows Flow doing the job. Leave that window open, and don't type in its
Flow tab during a request. Downloads are saved to `~/.flow-mcp/output` by default.

## Credits

- **Images are free.** Generating, editing and 2K upscaling never need credits.
- **Videos cost credits, and Flow's agent quotes the price first** ("costing 10 credits?"). The server
  approves only when the quote is within the `max_credits` you allow (default 10). A higher quote is
  rejected and nothing is spent.
- It never chooses Flow's "Always approve", and it never retries a paid generation on its own.
- If a project's agent is set to spend without asking (Agent settings: "Never"), chats and videos refuse
  to run there until it is switched back (`flow_settings` with approval `always`).
- The assistant is instructed to tell you the cost and ask before approving. Check the balance with
  `flow_credits` at any time.

| Observed on a free account (October 2026) | Credits |
|---|---:|
| 8 s Veo 3.1 Lite video | 10 |
| 8 s Veo 3.1 Fast video (quoted) | 20 |
| Omni 1.1 Flash video-to-video edit, 720p | 20 |
| Video with a speaking character (Omni 1.1 Flash, 10 s) | 15 |
| Image generation, editing, 2K upscale | free |

Every feature with its cost and plan limit is in [CAPABILITIES.md](../CAPABILITIES.md).

## Projects

Every request that creates something names a project:

- an existing `project_id` keeps working on the same piece. Flow's agent remembers it and your uploads
  are reused.
- `new_project_title` (with an optional `project_purpose`) starts a new idea.
- `new_session` resets the agent's memory but keeps the project's media.

## Uploads and rights

Local files go in `attachments`. Each is uploaded once per project, recognised by its content, and reused
afterwards. Media already in the project is attached by id with `media_ids` (list them with `flow_assets`).

Flow asks the uploader to confirm they hold the rights to each file. flow-mcp only confirms that when you
say so: per request (your assistant asks you), or once for all uploads if you chose that during `setup`.
Only attach files you own or may use.

## Videos

`generate_video` asks Flow's agent, approves within budget, and returns once rendering has started.
`flow_wait` then waits (up to about 90 s per call) and downloads the result. Inputs take a role:

| Role | Use |
|---|---|
| `start_frame` / `end_frame` | Image to video: start or end the shot on an image |
| `ingredients` | Reference images the video should use (Veo takes frames or ingredients, not both) |
| `source_video` | Video-to-video edit with Omni 1.1 Flash; output keeps the source clip's length |

`flow_frame` saves a video's first, last or timed frame as a PNG, so the next shot can start where the
last one ended.

## Characters

`flow_characters` lists Flow characters, creates one from a project image, and sets its name, notes and
voice (it also lists Flow's voices). Pass `characters` to `generate_image`, `generate_video` or
`flow_chat` to use them, so the same character looks the same across shots.

## MCP tools

| Tool | What it does | Cost |
|---|---|---|
| `flow_sign_in` | Opens the Flow window for the user to sign in to Google, and waits | free |
| `flow_status` | Health check: signed-in account, credits, and what is wrong if something is | free |
| `flow_credits` | Remaining Flow credits | free |
| `flow_projects` | Lists projects, with the purpose and uploads recorded for ones this tool made | free |
| `flow_assets` | Lists a project's images and videos with ids, sources and duplicate uploads | free |
| `flow_trash` | Moves media to Flow's trash: previews first, moves only with the confirmation code | free |
| `generate_image` | Creates or edits images; attach files or project media to edit or combine | free |
| `generate_images` | Several images at once in up to 3 parallel Flow tabs, about 3x faster | free |
| `flow_upscale` | Downloads an image at 2K (free) or 4K (paid plans), or lists the sizes offered | free / plan |
| `flow_chat` | Sends one message to Flow's agent and returns its exact reply | free |
| `flow_approve` | Approves or rejects the agent's spend request, within `max_credits` | quoted credits |
| `flow_wait` | Waits for media to finish and downloads it | free |
| `flow_transcript` | Reads a project's agent conversation | free |
| `flow_settings` | Reads or sets a project's defaults (image/video count, aspect, model) and agent instructions | free |
| `generate_video` | Starts a video within budget; inputs take a role (see above) | quoted credits |
| `flow_frame` | Saves a video's first, last or timed frame as PNG | free |
| `flow_characters` | Lists, creates and changes Flow characters: name, notes, voice; lists voices | free |
| `flow_capabilities` | Lists everything Flow offers and what this server covers | free |

## Command line

The same features work from a terminal, which helps when testing. `npx -y @parthmax/flow-mcp help` lists
them: `status`, `credits`, `projects`, `assets`, `image`, `edit`, `video`, `chat`, `transcript`, `upscale`.
