import { falFromRequest } from "../../../lib/fal";

export const maxDuration = 60;

// Uploads a local file (e.g. brand logo) to fal storage and returns its URL,
// so it can be passed as a reference image to nano-banana-2/edit.
export async function POST(req) {
  try {
    const fal = falFromRequest(req);
    if (!fal) {
      return Response.json({ error: "No fal.ai API key — enter yours in the form" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    const url = await fal.storage.upload(file);
    return Response.json({ url });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: err?.status === 401 ? 401 : 500 });
  }
}
