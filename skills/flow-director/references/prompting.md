# Prompting Flow's models

Flow's agent passes your words to Veo 3.1 (video), Nano Banana (images) or Gemini Omni (video edits). It may rewrite
them; a precise prompt survives rewriting better than a vague one. If it keeps changing your intent, add a standing
instruction with `flow_settings`, e.g. "Use my video prompts as written; do not rewrite or shorten them."

## Video formula

**[Cinematography] + [Subject] + [Action] + [Context] + [Style & ambiance] + [Audio]**

About 3-6 sentences (100-150 words). Lead with the camera.

> Medium shot, slow dolly-in. A tired office worker in a rumpled grey shirt rubs his temples in front of a bulky 1980s
> computer, in a cluttered office late at night. Harsh fluorescent overhead light and the green glow of the monitor.
> Retro look, shot on 1980s color film, slightly grainy. Ambient noise: buzzing fluorescent tubes. SFX: a single
> keyboard clack. No music.

### Camera vocabulary
- **Shot size:** extreme wide, wide, medium, medium close-up, close-up, extreme close-up, two-shot, over-the-shoulder, POV.
- **Angle:** eye level, low angle, high angle, top-down, Dutch angle.
- **Movement:** static, slow pan, tilt up, dolly in/out, tracking shot, crane up, aerial, handheld, orbit / 180° arc, dolly zoom.
- **Lens and focus:** wide-angle, telephoto compression, macro, shallow depth of field, rack focus, deep focus, soft focus.

Use film terms, not adjectives: "low-angle tracking shot, 35mm, shallow depth of field" beats "epic cinematic shot".

### Lighting and style
Name the light source and quality (golden hour backlight, hard noon sun, neon rim light, single spotlight, overcast
soft light), the palette (teal and orange, desaturated, pastel) and a medium (shot on 16mm film, anime cel shading,
claymation, Pixar-style 3D, oil painting). Keep these identical across shots: paste the style bible in every prompt.

### Audio (Veo 3.1 and Omni make sound)
- Dialogue in quotes, with who says it and how: `The detective says wearily, "Of all the offices in this town..."`
- `SFX: thunder cracks in the distance`
- `Ambient noise: the hum of a starship bridge`
- Music: "a soft piano score", or "No music". Say "No dialogue" when you want none; otherwise the model may invent some.
- Keep each line short enough to speak in the clip (about 2-3 words per second).

### Several shots in one clip: timestamps
```
[00:00-00:02] Medium shot from behind a young explorer with a leather satchel, pushing aside a jungle vine.
[00:02-00:04] Reverse shot of her freckled face, awe-struck. SFX: rustling leaves, distant bird calls.
[00:04-00:06] Tracking shot as she steps into the clearing and touches the carved stone wall.
[00:06-00:08] Wide high-angle crane shot revealing her small in the vast ruined temple. Music: a gentle orchestral swell.
```
For one unbroken take instead, say "single continuous shot, no cuts".

### Exclusions
Describe what you want rather than what you don't: "an empty desert road with no buildings" beats "no man-made
structures". Omni has no negative-prompt field; write exclusions into the prompt ("No text. No extra people.").

### On-screen text
Quote the exact words: `a neon sign that reads "OPEN 24H"`. Keep it short and in English; other scripts can come out garbled.

## Image prompts (Nano Banana)

Same ingredients without motion: shot size, subject with fixed traits, setting, light, style, aspect. For keyframes,
describe the exact first moment of the shot (pose, framing), since the video starts from it. For edits, say what to
change and what to keep: "Change her jacket to red leather. Keep her face, pose, lighting and background the same."

## Edit prompts (Omni video edits)

The opposite of generation prompts: short, one change, and say what stays.
- "Make this video anime. Keep everything else the same."
- "Change the lighting to low golden dusk with long shadows. Keep everything else the same."
- "Remove the phone from her hand. Keep everything else the same."
- "Change the sign to read 'Omni Flash'."

## Templates

**Product shot:** `Slow orbit close-up of [product] on [surface], [light] reflecting off its [material]. [Background].
Clean commercial look, shallow depth of field. SFX: [sound]. Soft electronic music.`

**Dialogue line:** `Medium close-up of [character, fixed traits] in [setting]. [He/She/They] [action] and says
[tone], "[line]". [Light]. [Style bible]. Ambient noise: [room tone]. No music.`

**Establishing shot:** `Aerial wide shot slowly pushing in over [place] at [time of day], [weather]. [Style bible].
Ambient noise: [environment].`

**Transition (with start and end frames):** `The camera [move, e.g. performs a smooth 180-degree arc] from the first
frame to the last frame, as [what changes]. [Audio].`
