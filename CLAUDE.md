# fb-video-ad-tool — how we make Stailio video ads

Local Next.js tool + CLI scripts that turn an ad brief into a 15-second 9:16 Meta video ad
via fal.ai. Hosted copy (bring-your-own fal key): https://fb-video-ad-tool.vercel.app
Everything Claude needs to do the job is in this file. Read it fully before acting.

## The user's workflow (what they will paste)

The user pastes ONE brief containing three parts:
1. the **ad script** — timed beats (0:00–0:03 HOOK …) with VISUAL / DIALOGUE / VO / CAPTION lines,
   sometimes a SOUND DESIGN timeline;
2. a **FIRST FRAME photo prompt**;
3. a **LAST FRAME photo prompt**.

Your job: produce `output/<slug>/<slug>.mp4` with the real Stailio logo, with zero wasted paid renders.

## Hard rules (money is real — every generation is billed)

- **Prompts go to the model VERBATIM.** Never paraphrase, "improve", or compose prompts.
  - first.txt  = the first-frame prompt, byte-for-byte (keep markdown, curly quotes, emojis)
  - last.txt   = the last-frame prompt, byte-for-byte
  - video.txt  = the script from its title through the CTA block, byte-for-byte. Include a
    SOUND DESIGN section if present (MiniMax H3 renders audio). EXCLUDE the two photo prompts
    and any "clean audio script" duplicate of the dialogue.
- **Always review both keyframes (Read the PNGs) before rendering the video.** Frames cost
  cents; a 15 s video costs dollars and only ever sees the two frames.
- **Never render a video with a broken frame.** Fix frames with `edit_frame.mjs` first.
- If you believe a prompt change would help, **ask before spending**. Exception — the fixes
  listed under "Known failure modes" are pre-approved.
- Videos always use **duration 15** (API range 5–15), **768P** (native; 2K/4K are upscales),
  endpoint `minimax/h3/image-to-video/lora` with the Realism-People LoRA at 1.0 — unless the
  user says otherwise. Stylised ads (claymation, doll/CinePlastic) MAY drift toward realism with
  the LoRA; if a result looks off-style, offer a re-render with `--no-lora`.
- Output naming: one folder per ad concept, `output/<slug>/`, video named `<slug>.mp4`,
  JSON sidecars next to every asset. Slug = kebab-case of the ad's angle/title
  (e.g. `thriller-something-is-following-her`). `output/` is git-ignored.

## Procedure

```bash
# 0. write the three prompt files verbatim
mkdir -p prompts/<slug>            # prompts/ is fine to keep locally
#    prompts/<slug>/first.txt  prompts/<slug>/last.txt  prompts/<slug>/video.txt

# 1. keyframes (first frame = text-to-image; last frame = edit with first frame + logo as references)
node scripts/make_ad.mjs images <slug> prompts/<slug>
#    -> output/<slug>/frame-start.png, frame-end.png, manifest.json

# 2. REVIEW both PNGs with the Read tool. Check the list below. Fix if needed:
node scripts/edit_frame.mjs <slug> end "<instruction>" --with-logo      # or: start
#    -> frame-end-v2.png …, manifest now points at the fixed frame

# 3. video (submits to fal queue, polls, downloads; 1–15 min)
node scripts/make_ad.mjs video <slug> prompts/<slug>      # run with run_in_background + timeout 600000
#    -> output/<slug>/<slug>.mp4 + <slug>.json
```

The logo defaults to `../stailio/public/brand/logo-ink-on-cream.png` (a "◆ STAILIO ◆" serif
wordmark). Other colour variants live in the same folder; `--logo <file>` overrides. The scripts
append one sentence to the LAST-frame prompt telling the model to copy the logo exactly — this is
the only approved prompt addition.

## Frame review checklist

- Same person in both frames (face, hair, skin tone, age). The end frame references the start
  frame, so this usually holds — but check.
- Outfit in the end frame matches the script's list exactly; nothing extra layered.
- The right person transformed (two-women scenes have swapped roles before).
- Real logo present where the script wants STAILIO; no invented logo.
- **No real third-party brands** (Zara, H&M, COS, ASOS, Gucci, Chanel, Prada, LV…): models draw
  them on bags/boxes/app listings whenever a prompt says "shopping bags". Meta rejects such ads.
- Baked captions read exactly as the script says (models sometimes invent their own text).
- Text not overlapped by the subject. If the edit model refuses to move text, erase it instead —
  CTA typography is overlaid in post anyway.
- App UI text legible, not gibberish.

## Known failure modes and pre-approved fixes (use `edit_frame.mjs`)

| Problem | Fix instruction pattern |
|---|---|
| Real brand logos on bags | "Make every shopping bag a plain unbranded paper bag with no text, letters or logos. Keep everything else exactly identical: …" — **do not name the brands** (naming them trips fal's content checker → 422) |
| Wrong/invented caption | "Change the caption text to read exactly: … Keep everything else identical" |
| Extra clothing layered | append to last.txt: "Important: she wears ONLY those exact items — …, nothing layered underneath" and regenerate |
| Roles swapped (two people) | append: "Important: <lead> is the <description> from the reference image — she is the one <doing X>" |
| Gibberish app UI text | "Fix the text on the phone screen so it reads: … Keep everything else identical" |
| Text overlapped by subject | "Erase the text at the bottom … leaving clean empty space" (moving text rarely works) |

Always keep the instruction's tail: "Keep everything else exactly identical: the same woman,
pose, outfit, background, lighting and composition."

## fal.ai gotchas

- `/lora` endpoint requires ≥1 LoRA (empty list → 422). Base `minimax/h3/image-to-video` takes
  the same first/last-frame inputs without one.
- `queue.status` can say COMPLETED while `queue.result` throws 422 — the job failed validation.
- `fal.subscribe` inside an HTTP request times out on long renders; the video stage uses
  `queue.submit` + polling for that reason.
- fal storage URLs (uploaded logo) may expire — the images stage re-uploads each run.
- nano-banana-2/edit accepts multiple `image_urls`: [previous frame, logo].

## Repo layout

- `app/` — Next.js UI + API routes (`/api/image`, `/api/video` submit, `/api/video/status`, `/api/upload`)
- `lib/fal.js` — per-request fal client (user key header → env fallback); `lib/save.js` — output saving
- `scripts/make_ad.mjs`, `scripts/edit_frame.mjs` — the CLI pipeline described above
- `output/<slug>/` — generated ads (git-ignored); `.env.local` holds FAL_KEY (git-ignored)
- Deploy: `vercel --prod --yes`. Never start the dev server unless asked (user runs it).
