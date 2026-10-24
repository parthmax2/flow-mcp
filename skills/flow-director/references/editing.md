# Editing, swapping and restyling

All video edits here are Gemini Omni video-to-video edits: `generate_video` with `source_video` (about 20 credits
at 720p; the output keeps the source clip's length). Image edits (`generate_image` with the image attached) are free,
so fix things in stills whenever the video hasn't been made yet.

## Limits to plan around

- Omni edits a segment of up to about 10 s; longer uploads get trimmed. Cut long footage into ≤10 s pieces first.
- One change per edit, ending with "Keep everything else the same." Compound edits fail more often.
- About 3 edits deep, context and identity start slipping; re-anchor or start from a clean version.
- Attach references with the first request; adding them in a later turn can unsettle a scene that was working.
- Extending a clip, Insert/Remove with a drawn box, camera re-framing, Scenebuilder timelines and 1080p/4K video
  export are Flow website features this server doesn't drive yet. Tell the user when they need one.

## Character swap

The source footage gives the performance; the reference gives the identity. Give each input one job.

**A. Edit the footage directly (keeps the real motion best):**
1. Get the user's confirmation they hold rights to the footage and the face.
2. Make a clean reference of the new character (`references/consistency.md`).
3. `generate_video` with `source_video: <clip>`, `ingredients: [<character reference>]` (an Omni edit; this
   combination is untested here, and if Flow's agent says it can't combine them, use B), and a prompt like:
   "Replace the man in the video with the character from the reference. Keep his motion, timing, camera, lighting
   and background exactly the same."
4. Check frames with `flow_frame`. If the face drifts, one follow-up edit: "Make the face match the reference more
   closely. Keep everything else the same."

**B. Re-shoot from a swapped first frame (more control, motion is re-generated):**
1. `flow_frame` the source's first frame (and last, if the ending matters).
2. Free image edit: attach the frame and the character reference, "Replace the person with the character from the
   second image, same pose, same lighting and background."
3. `generate_video` with `start_frame: <edited frame>` (optionally `end_frame`) and a prompt describing the original
   action and camera. No ingredients: Veo takes frames or ingredients, not both, and the edited frame already
   carries the new identity.

Use A when the exact performance matters, B when the shot can be reinterpreted or A keeps drifting.

## Restyle

- **Whole look:** `source_video` + "Make this video [anime / claymation / Pixar-style 3D / watercolor / 1970s 16mm
  film]. Keep the characters, motion and framing the same." Identity and motion are kept; rendering changes.
- **With a style image:** add it as an ingredient: "Restyle the video in the style of the reference image. Keep
  everything else the same." One job per reference: style image for style, character image for identity.
- **Light and grade only:** be concrete: "Change the lighting to low golden dusk with long shadows" beats "make it
  cinematic".
- **A series in one style:** restyle the keyframes (free images) first and generate from them, rather than
  restyling every finished clip. Restyle as the last pass, after content is final.

## Continue a shot

Flow's own Extend isn't available here. Instead: `flow_frame(at: "last")` on the clip, then a new `generate_video`
with that frame as `start_frame` (no ingredients) and a prompt that picks up the action and repeats the character's
fixed traits ("She keeps walking toward the door, the camera keeps tracking her..."). Tested: the new clip opens on
the exact frame and the character holds. Join the clips in an editor; cut on motion to hide the seam.

## Small fixes

| Problem | Fix |
|---|---|
| Wrong prop or wardrobe | Omni edit: "Put a [x] in her hand" / "Make the jacket red". Keep everything else the same. |
| Unwanted object | "Remove the [x]. Keep everything else the same." |
| Wrong text on a sign | "Change the sign to read '[text]'." |
| Lighting or mood off | Concrete light edit, as above. |
| Wrong camera move or framing | Regenerate from the same `start_frame` with the camera described first. |
| Bad audio | Regenerate with explicit audio lines (`SFX:`, `Ambient noise:`, quoted dialogue, "No music"). |
