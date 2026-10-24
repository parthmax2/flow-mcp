# Keeping characters and settings consistent

Consistency comes from a few locked references reused every time, not from longer descriptions.

## 1. Make a character sheet (free)

Per recurring character, with `generate_image` (or `generate_images` for several at once) in the piece's project:

1. **Master image:** "Full-body portrait of [name]: [age], [build], [face: eye color, distinctive marks], [hair:
   color, length, style], wearing [exact outfit, colors, materials]. Standing, neutral expression, plain light grey
   studio background, even soft light, [style bible]. One image."
2. **Extra views from the master** (attach it with `media_ids`): "Same character, same outfit, three-quarter view" /
   "...profile view" / "...close-up of the face". Say "keep the face, hair and outfit exactly the same".
3. Look at the results yourself. Regenerate any view that drifted, then pick the best: usually the full body.
4. **Make it a Flow character** (free): `flow_characters(action: "create", image_id: <best view>, name, info,
   voice)`. `info` holds the fixed traits and personality (the Flow agent reads it whenever the character is used);
   `voice` is one of Flow's 30 voices (`action: "voices"` lists them with descriptions, e.g. "Charon: male,
   informative, lower pitch"). From then on the character is attached by name: `characters: ["Mara"]`.

Rules that matter:
- **Plain or segmented backgrounds** for character and product references. A busy background leaks into shots.
- **No extra people** in location or style references unless you want them in the shot.
- **One look across all references:** don't mix a photoreal face with a painted background unless that's the point.
- **Fixed traits stay word-for-word the same** in every prompt (copy them from the plan). Change only clothing,
  setting and action, and only on purpose.
- From the user's own photo: ask for rights first, then make a clean sheet from it ("same person, plain grey
  background, full body") rather than using a busy snapshot directly.

## 2. Use the character in every shot

A video is made either from frames (image-to-video: `start_frame`, optional `end_frame`) or from references
(reference-to-video: characters or `ingredients`). Veo never takes both at once; given both, Flow's agent stops and
asks. So the character reaches a shot in one of three ways:

- **As a Flow character (best for shots with people, and the only way to keep a voice):** `generate_video` with
  `characters: ["Mara", "Theo"]` and no frames. Tested: Flow's agent picks Omni 1.1 Flash for characters with speech
  (15 credits for 10 s, with sound), and both faces, outfits and props held in a new scene.
- **Through a keyframe (most control over the composition):** a free `generate_image` of the shot's first moment with
  `characters: [...]` attached, checked by eye, then `generate_video` with `start_frame: <keyframe>`. Tested: two
  characters held their look in a scene neither reference showed. The voice is then only what the prompt describes.
- **As ingredients:** `generate_video` with `ingredients: [<sheet images>]`, when a character hasn't been made.

In all cases:
- Name the character in the prompt exactly as it is named in Flow, the same way each time.
- Keep shots to 1-2 characters; three is the practical maximum before identities blur.
- Dialogue: write each line in quotes with who says it (`Theo says dryly, "..."`). With Flow characters, each
  speaks in their own voice.

## 3. Chain shots with frames

- After a shot is done: `flow_frame(video: <media id>, project_id, at: "last")`, then pass the PNG as the next shot's
  `start_frame` (no ingredients). The next shot opens exactly where the last one ended: same face, outfit, light and
  place. Tested: identity held across the cut.
- For a cut to a new angle, use that shot's approved keyframe (made with the sheet attached) as `start_frame` instead.
- `end_frame` pins where a shot must land, e.g. a planned final pose or a match cut into the next shot.
- Veo follows the start frame more faithfully than the described action. If the action matters, state it plainly
  and early in the prompt, and keep it to one or two beats per 8 s.
- Flow marks every video (a sparkle and "Veo" in the corner). A marked frame used as a start frame didn't produce a
  doubled mark in testing, so there's no need to clean frames first.

## 4. When it drifts

- **Check every shot:** take a mid and last frame with `flow_frame` and compare with the sheet: face shape, hair,
  outfit colors, marks.
- **Small drift** (outfit color, a missing accessory): one Omni edit, "Make her jacket dark green as in the reference.
  Keep everything else the same", with the sheet as an ingredient.
- **Identity drift** (a different face): don't edit it; regenerate the shot from the previous good frame with the
  ingredients, after the user OKs the credits.
- **Edit chains:** one change per edit; after about 3 edits on the same clip, quality and identity slip. Re-anchor
  with "Keep all character details and motion exactly as they are. Only change X", or go back to a clean version.

## Managing characters

- `flow_characters` (list) shows each character's name, info, voice and reference image; check it before planning.
- `action: "update"` changes name, info or voice. Changing info changes how the agent writes every later shot.
- Characters belong to one project. Keep a piece in one project so its cast is always at hand.

## Flow features this server doesn't drive yet

`@me` avatars (the user's own face and voice, recorded on their phone), custom voices and adding a second view
("Create body") to a character are set up on the Flow website. For a voice outside Flow's 30, describe it
identically every time ("a low, gravelly male voice with a slow pace").
