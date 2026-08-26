#!/usr/bin/env node
// Fix a generated keyframe with nano-banana-2/edit and update output/<slug>/manifest.json.
//
//   node scripts/edit_frame.mjs <slug> <start|end> "<edit instruction>" [--with-logo]
//
// Uses the current frame from the manifest as the reference (plus the logo if --with-logo),
// saves frame-<start|end>-vN.png and points the manifest at the new URL so the video stage uses it.

import { fal } from "@fal-ai/client";
import fs from "node:fs/promises";
import path from "node:path";

const [slug, which, instruction, ...rest] = process.argv.slice(2);
if (!slug || !["start", "end"].includes(which) || !instruction) {
  console.error('usage: edit_frame.mjs <slug> <start|end> "<instruction>" [--with-logo]');
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  const env = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  process.env.FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
}

const OUT = path.join(process.cwd(), "output", slug);
const manifestPath = path.join(OUT, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const key = which === "start" ? "firstUrl" : "lastUrl";
const refs = [manifest[key]];
if (rest.includes("--with-logo") && manifest.logoUrl) refs.push(manifest.logoUrl);

const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
  input: { prompt: instruction, image_urls: refs, aspect_ratio: "9:16", num_images: 1, output_format: "png" },
});
const url = result.data.images[0].url;

const existing = (await fs.readdir(OUT)).filter((f) => f.startsWith(`frame-${which}`) && f.endsWith(".png"));
const base = `frame-${which}-v${existing.length + 1}`;
const res = await fetch(url);
await fs.writeFile(path.join(OUT, `${base}.png`), Buffer.from(await res.arrayBuffer()));
await fs.writeFile(path.join(OUT, `${base}.json`), JSON.stringify({ model: "fal-ai/nano-banana-2/edit", prompt: instruction, references: refs, image_url: url }, null, 2));

manifest[key] = url;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`saved output/${slug}/${base}.png — manifest updated\n${url}`);
