import { fal } from "@fal-ai/client";
import fs from "node:fs/promises";
import path from "node:path";

const S = process.argv[2]; // dir with adN_{first,last,video}.txt
const ADS = [
  { n: 1, slug: "ad1-the-bad-photo" },
  { n: 2, slug: "ad2-the-money-leak" },
  { n: 3, slug: "ad3-the-closet-challenge" },
  { n: 4, slug: "ad4-the-friend-who-always-looks-good" },
  { n: 5, slug: "ad5-your-closet-styles-itself" },
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function save(dir, base, url, sidecar) {
  await fs.mkdir(dir, { recursive: true });
  const res = await fetch(url);
  await fs.writeFile(path.join(dir, `${base}.png`), Buffer.from(await res.arrayBuffer()));
  await fs.writeFile(path.join(dir, `${base}.json`), JSON.stringify(sidecar, null, 2));
}

const manifest = {};
await Promise.all(
  ADS.map(async (ad) => {
    const dir = path.join(process.cwd(), "output", ad.slug);
    const firstPrompt = await fs.readFile(`${S}/ad${ad.n}_first.txt`, "utf8");
    const lastPrompt = await fs.readFile(`${S}/ad${ad.n}_last.txt`, "utf8");

    const first = await fal.subscribe("fal-ai/nano-banana-2", {
      input: { prompt: firstPrompt, aspect_ratio: "9:16", num_images: 1, output_format: "png" },
    });
    const firstUrl = first.data.images[0].url;
    await save(dir, `${stamp()}_frame-start`, firstUrl, {
      model: "fal-ai/nano-banana-2", prompt: firstPrompt, image_url: firstUrl,
    });
    console.log(`ad${ad.n} first frame done`);

    const last = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: { prompt: lastPrompt, image_urls: [firstUrl], aspect_ratio: "9:16", num_images: 1, output_format: "png" },
    });
    const lastUrl = last.data.images[0].url;
    await save(dir, `${stamp()}_frame-end`, lastUrl, {
      model: "fal-ai/nano-banana-2/edit", prompt: lastPrompt, reference: firstUrl, image_url: lastUrl,
    });
    console.log(`ad${ad.n} last frame done`);

    manifest[ad.slug] = { n: ad.n, firstUrl, lastUrl };
  })
);

await fs.writeFile(`${S}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log("ALL IMAGES DONE");
