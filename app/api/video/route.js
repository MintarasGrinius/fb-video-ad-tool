import { falFromRequest } from "../../../lib/fal";

export const maxDuration = 60;

// Submits the video job to fal's queue and returns immediately with a request id.
// The client polls /api/video/status — required on Vercel, where a function
// can't hold a connection open for a multi-minute render.
export async function POST(req) {
  try {
    const fal = falFromRequest(req);
    if (!fal) {
      return Response.json({ error: "No fal.ai API key — enter yours in the form" }, { status: 401 });
    }

    const {
      prompt,
      image_url,
      end_image_url,
      duration,
      resolution,
      model = "h3",
      lora_url,
      lora_scale,
    } = await req.json();

    if (!prompt?.trim()) {
      return Response.json({ error: "Video prompt is required" }, { status: 400 });
    }
    if (!image_url || !end_image_url) {
      return Response.json(
        { error: "Generate both the start and end images first" },
        { status: 400 }
      );
    }

    const input = {
      prompt,
      image_url,
      end_image_url,
      duration: Number(duration) || 5,
      resolution: resolution || "768P",
    };

    if (!["h3", "h3-max"].includes(model)) {
      return Response.json({ error: "Unknown video model" }, { status: 400 });
    }
    let endpoint = model === "h3-max" ? "minimax/h3-max/image-to-video" : "minimax/h3/image-to-video";
    if (model === "h3-max") {
      input.prompt_expansion_mode = "balanced";
    } else if (lora_url?.trim()) {
      endpoint = "minimax/h3/image-to-video/lora";
      input.loras = [{ path: lora_url.trim(), scale: Number(lora_scale) || 1 }];
    }

    const { request_id } = await fal.queue.submit(endpoint, { input });
    return Response.json({ request_id, endpoint });
  } catch (err) {
    return Response.json(
      { error: err?.body?.detail ? JSON.stringify(err.body.detail) : String(err) },
      { status: err?.status === 401 ? 401 : 500 }
    );
  }
}
