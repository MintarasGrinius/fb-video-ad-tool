import fs from "node:fs/promises";
import path from "node:path";

export function slugify(name, fallback = "untitled") {
  return (
    (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Downloads a generated file into output/<concept-slug>/<baseName>.<ext>
// and optionally writes a JSON sidecar with the request that produced it.
export async function saveToOutput({ concept, baseName, ext, url, sidecar }) {
  const dir = path.join(process.cwd(), "output", slugify(concept));
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${baseName}.${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  await fs.writeFile(filePath, Buffer.from(await res.arrayBuffer()));

  if (sidecar) {
    await fs.writeFile(
      path.join(dir, `${baseName}.json`),
      JSON.stringify(sidecar, null, 2)
    );
  }
  return path.relative(process.cwd(), filePath);
}
