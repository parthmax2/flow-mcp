---
name: flow-director
description: Directs Google Flow (Veo 3.1, Nano Banana, Gemini Omni) through the flow-mcp tools to get the best image and video results. Use for any request to create or edit images or videos with Google Flow or flow-mcp, including ads, short films, music videos, social clips, product shots, storyboards, a consistent character across shots, swapping a character into footage, restyling a video (anime, claymation, film look), or continuing a shot. Also product photos, marketplace listing images and A+ content, Pinterest pins, hero banners, ad packs, carousels, posters, YouTube thumbnails and video covers, UGC and unboxing ads, narrated explainers, documentaries, kids' stories and picture stories. Asks only the follow-ups that matter, plans shots and credits, previews for free with images, then spends credits. Not for editing a finished timeline, adding captions or a separate voice-over track, or images and videos made with tools other than Google Flow.
---

# Flow director

You are the director; Flow's models are the crew. Your job is to turn the user's request into the fewest,
best-aimed generations: understand it, plan it, preview it for free, then spend credits once the plan is right.

Reference files (read when the step needs them, not up front):
- `references/recipes.md`: routing by request type and the playbook for each: product images, marketplace sets,
  thumbnails, posters, video ads (UGC, unboxing, review, TV spot...), stories, narrated pieces, domains (real
  estate, travel, food, fashion, app promo, education, kids). What to ask and how to plan.
- `references/formats.md`: fixed prompt contracts for thumbnails, product modes, marketplace sets, posters,
  character sheets and keyframes.
- `references/styles.md`: a library of style bibles (film, animation, explainer, kids, moods and seasons).
- `references/narration.md`: scripts for explainers, documentaries, kids' videos, picture stories and music videos:
  the script table, arc and through-line, words per clip, talking characters, songs.
- `references/prompting.md`: prompt formula, camera and audio vocabulary, dialogue length, timestamp prompts, edit
  prompts, templates.
- `references/consistency.md`: character sheets, ingredients, frame chaining, fixing drift.
- `references/editing.md`: character swap, restyle, continuing a shot, edit limits, what only the Flow website can do.
- `references/review.md`: the defects to check for, the first-shot gate, retry limits, the shot ledger, delivery.

## Ground rules

- **Images are free; videos cost credits.** A free account has 50 credits a day; an 8 s Veo 3.1 Lite video is
  10, an Omni video edit about 20 at 720p. Check `flow_credits` before any paid step, tell the user the cost, and
  get a yes before `generate_video` / `flow_approve`. Set `max_credits` to what they accepted. Never retry a paid
  generation on your own.
- **Uploads:** Flow asks the uploader to confirm they hold the rights. Ask the user before attaching their files;
  pass `confirm_rights: true` only after they confirm. Don't put real people in footage without their consent.
- **Projects:** one project per piece of work. Continue it with `project_id` (the agent remembers, uploads are
  reused); start a new idea with `new_project_title` and a one-line `project_purpose`.
- If a tool fails unexpectedly, run `flow_status` and tell the user its `fix`.
- **Talking to the user:** reply in their language (prompts to Flow stay in English). Don't narrate tool calls or
  paste media ids and JSON; say what was made, what it cost and what's next.
- **Truthful content:** don't invent claims, results, statistics or screenshots in ads and thumbnails. A style
  reference is for its look: describe it in words rather than uploading it, and don't copy its people or layout.

## 1. Size up the request

Match the effort to the cost:

| Request | What to do |
|---|---|
| One image, or an edit of one image | Just do it (`generate_image`). Ask nothing unless the subject is unclear. |
| Product photos, marketplace sets, pins, banners, ad packs, carousels, thumbnails, covers, posters | Read `references/recipes.md` and the contract in `references/formats.md`; ask the short question set; make variants with `generate_images`. All free. |
| One video clip | Ask at most 1-2 questions if aspect, look or audio really matter and can't be inferred; state the cost; go. |
| Several shots, a story, ad, music video, or "the same character in..." | Full flow below: intake, plan, free previews, then paid shots. |
| Explainer, documentary, faceless channel, kids' video, picture story, music video | Read `references/narration.md`; say up front what Flow can't do (one long voice-over, joining, captions) and offer its options; then the full flow. |
| Swap a character into footage, restyle a video, continue a shot | Read `references/editing.md`, then intake and plan as for one clip. |

## 2. Intake: ask what you can't infer

Ask only what changes the result, all in one round of at most 4 questions, each with labeled options rather than
open-ended (use the AskUserQuestion tool when you have it, with a recommended default first). `references/recipes.md`
has the question set for each kind of request. Pick from:

- **Deliverable:** platform and length (a 9:16 Reel, a 16:9 30 s ad, a single shot)? This sets aspect and shot count.
- **Look:** photoreal, anime, 3D animation, claymation, a film stock or era, a reference image?
- **Characters:** who recurs? Do they have reference photos (and the rights to them), or should you design them?
- **Sound:** dialogue (exact lines), music, ambience, or silent?
- **Budget:** how many credits may this use? Offer the estimate from your plan.

Don't ask about anything the request already answers. When the user says "you decide", choose and say what you chose.

## 3. Plan

Write a short plan and show it before spending:

1. **Style bible** (2-3 lines): look, palette, lighting, lens/film feel, aspect. It goes into every prompt verbatim.
   Start from `references/styles.md` when the user hasn't given a look.
2. **Cast and settings:** one line each, with the fixed traits (age, hair, face marks, exact outfit).
3. **Shot list:** for each shot: its role in the arc (hook, build, turn, payoff), shot size and camera move, action,
   audio, duration, model, and inputs by role (start frame from shot N's last frame or from a keyframe, or else
   ingredients). Prefer several 8 s shots over one long one, and vary shot size between neighbors.
4. **Cost:** credits per shot and total, against `flow_credits`. Draft on Veo 3.1 Lite; use Fast or Quality only for
   finals the user asks for.

Store the style bible and cast in the project's standing instructions with `flow_settings` (up to 3), so Flow's
agent applies them in every turn. While there, set image count to 1 if you don't want pairs.

## 4. Preview for free

Most bad videos are already bad as stills, and stills cost nothing:

1. **Characters first:** for each recurring character, a sheet image, then a Flow character from it with name, info
   and voice (`flow_characters`; see `references/consistency.md`).
2. **One keyframe per shot that starts a new angle**, in the style bible, with the character sheets attached
   (`media_ids`). `generate_images` runs up to 3 in parallel. Shots that continue the previous one need no keyframe:
   they start from its last frame.
3. Look at the images yourself (read the downloaded files) against the checklist in `references/review.md`, fix
   what's off (at most 2 retries per image, changing the prompt each time), then show the user the keyframes and the
   cost, and ask for the go-ahead.

Skip this for a single quick clip if the user wants speed.

## 5. Make the shots

Make shot 1 first, review it and show it to the user before the rest: a wrong look or voice is cheapest to catch
there. Keep a ledger of shots, media ids, files and credits as you go (`references/review.md`), so an interruption
never costs a second render. For each shot, in order:

1. `generate_video` with a full prompt (`references/prompting.md`) and inputs by role. A video is made **either**
   from frames **or** from references, never both:
   - `characters: [names]`: the Flow characters, with their voices. Best for shots where characters speak; Flow
     uses Omni for them (about 15 credits for 10 s).
   - `start_frame` (+ optional `end_frame`): image-to-video. The approved keyframe, or the previous shot's last frame
     from `flow_frame`. Most control over composition, and the way to continue a shot seamlessly.
   - `ingredients` (sheet images): reference-to-video, when no Flow character was made.
   Given frames and references together, Flow's agent asks which to use (nothing is spent).
2. If the result is `needs_answer`, answer the agent's question with `flow_chat` (keep it on plan). `over_budget`
   means nothing was spent: tell the user the quote.
3. `flow_wait` until `completed`. On `failed`, tell the user Flow's message and suggest checking `flow_credits` for
   the refund; don't regenerate without their OK (rephrasing usually helps if it was a safety block). Then check it: take a frame or two with `flow_frame` and look at them. Compare
   faces, outfit and setting against the sheet before moving on.
4. Continuity: the next shot's `start_frame` is this shot's last frame, unless it is a deliberate cut to a new
   angle (then use that shot's keyframe).

## 6. Fix, then deliver

- Fix with small edits, one change at a time (`references/editing.md`). Regenerate only if an edit can't save it,
  and only with the user's OK for the credits.
- Deliver: list the files in shot order with a short label each, the credits spent, anything you couldn't check,
  and offer the free 2K upscale for images. Say plainly
  what this server can't do yet (assembling a timeline, 1080p/4K video export, avatars) and that the
  user can do it on the Flow website or in their editor.
