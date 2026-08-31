#!/usr/bin/env node
// Generate a Stailio ad: keyframes (stage "images") and/or video (stage "video").
//
//   node scripts/make_ad.mjs images <slug> <promptDir> [--logo <file>] [--no-logo]
//   node scripts/make_ad.mjs video  <slug> <promptDir> [--first <url>] [--last <url>]
//                                   [--duration 15] [--resolution 768P] [--no-lora]
//
// promptDir must contain first.txt, last.txt, video.txt — the user's prompts VERBATIM.
// Everything is written to output/<slug>/ : frames, <slug>.mp4, JSON sidecars, manifest.json.
// FAL_KEY is read from .env.local (or the environment).

import { fal } from "@fal-ai/client";
import fs from "node:fs/promises";
import path from "node:path";

const [stage, slug, promptDir, ...rest] = process.argv.slice(2);
if (!["images", "video"].includes(stage) || !slug || !promptDir) {
  console.error("usage: make_ad.mjs <images|video> <slug> <promptDir> [options]");
  process.exit(1);
}
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? def : rest[i + 1];
};
const flag = (name) => rest.includes(`--${name}`);

await loadEnv();
const OUT = path.join(process.cwd(), "output", slug);
await fs.mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8").catch(() => "{}"));

const LORA = "https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA/resolve/main/h3-realism-people-t2v-i2v-r2v.safetensors";
const DEFAULT_LOGO = path.resolve(process.cwd(), "../stailio/public/brand/logo-ink-on-cream.png");
const LOGO_NOTE =
  "\n\nUse the exact logo from the provided logo reference image wherever the brand logo or the word STAILIO appears — do not invent or restyle the logo.";

if (stage === "images") {
  const firstPrompt = await fs.readFile(path.join(promptDir, "first.txt"), "utf8");
  const lastPrompt = await fs.readFile(path.join(promptDir, "last.txt"), "utf8");

  let logoUrl = null;
  if (!flag("no-logo")) {
    const logoPath = opt("logo", DEFAULT_LOGO);
    const buf = await fs.readFile(logoPath);
    logoUrl = await fal.storage.upload(new File([buf], path.basename(logoPath), { type: "image/png" }));
    console.log("logo uploaded:", logoUrl);
  }

  // First frame: plain text-to-image, prompt verbatim.
  const first = await fal.subscribe("fal-ai/nano-banana-2", {
    input: { prompt: firstPrompt, aspect_ratio: "9:16", num_images: 1, output_format: "png" },
  });
  const firstUrl = first.data.images[0].url;
  await save("frame-start", firstUrl, { model: "fal-ai/nano-banana-2", prompt: firstPrompt, image_url: firstUrl });
  console.log("first frame:", firstUrl);

  // Last frame: edit endpoint with first frame (character consistency) + logo as references.
  const refs = [firstUrl, ...(logoUrl ? [logoUrl] : [])];
  const prompt = lastPrompt + (logoUrl ? LOGO_NOTE : "");
  const last = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: { prompt, image_urls: refs, aspect_ratio: "9:16", num_images: 1, output_format: "png" },
  });
  const lastUrl = last.data.images[0].url;
  await save("frame-end", lastUrl, { model: "fal-ai/nano-banana-2/edit", prompt, references: refs, image_url: lastUrl });
  console.log("last frame:", lastUrl);

  Object.assign(manifest, { slug, firstUrl, lastUrl, logoUrl });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nFrames saved in ${path.relative(process.cwd(), OUT)}/ — REVIEW THEM before running the video stage.`);
}

if (stage === "video") {
  const videoPrompt = await fs.readFile(path.join(promptDir, "video.txt"), "utf8");
  const firstUrl = opt("first", manifest.firstUrl);
  const lastUrl = opt("last", manifest.lastUrl);
  if (!firstUrl || !lastUrl) throw new Error("No frame URLs — run the images stage first or pass --first/--last");

  const input = {
    prompt: videoPrompt,
    image_url: firstUrl,
    end_image_url: lastUrl,
    duration: Number(opt("duration", 15)),
    resolution: opt("resolution", "768P"),
  };
  const model = opt("model", "h3-max");
  if (!["h3", "h3-max"].includes(model)) throw new Error("--model must be h3 or h3-max");
  let endpoint = model === "h3-max" ? "minimax/h3-max/image-to-video" : "minimax/h3/image-to-video";
  if (model === "h3-max") input.prompt_expansion_mode = "balanced";
  if (model === "h3" && !flag("no-lora")) {
    endpoint = "minimax/h3/image-to-video/lora";
    input.loras = [{ path: LORA, scale: 1 }];
  }

  const { request_id } = await fal.queue.submit(endpoint, { input });
  console.log("submitted:", request_id, "— polling (renders take 1–15 min)…");

  for (;;) {
    await new Promise((r) => setTimeout(r, 10000));
    const st = await fal.queue.status(endpoint, { requestId: request_id });
    process.stdout.write(`${st.status} `);
    if (st.status === "COMPLETED") break;
  }
  // Note: result() can throw a 422 even after COMPLETED — that means the job failed validation.
  const result = await fal.queue.result(endpoint, { requestId: request_id });
  const url = result.data.video.url;
  const res = await fetch(url);
  await fs.writeFile(path.join(OUT, `${slug}.mp4`), Buffer.from(await res.arrayBuffer()));
  await fs.writeFile(
    path.join(OUT, `${slug}.json`),
    JSON.stringify({ endpoint, request_id, ...input, video_url: url, logo_reference: manifest.logoUrl }, null, 2)
  );
  Object.assign(manifest, { videoUrl: url, videoRequestId: request_id });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n\nvideo saved: output/${slug}/${slug}.mp4\n${url}`);
}

async function save(base, url, sidecar) {
  const res = await fetch(url);
  await fs.writeFile(path.join(OUT, `${base}.png`), Buffer.from(await res.arrayBuffer()));
  await fs.writeFile(path.join(OUT, `${base}.json`), JSON.stringify(sidecar, null, 2));
}

async function loadEnv() {
  if (process.env.FAL_KEY) return;
  try {
    const env = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
    const m = env.match(/^FAL_KEY=(.+)$/m);
    if (m) process.env.FAL_KEY = m[1].trim();
  } catch {}
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY not found in env or .env.local");
}
