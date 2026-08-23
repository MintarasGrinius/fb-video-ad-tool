import { falFromRequest, canSaveLocally } from "../../../../lib/fal";
import { saveToOutput, timestamp } from "../../../../lib/save";

export const maxDuration = 60;

export async function POST(req) {
  try {
    const fal = falFromRequest(req);
    if (!fal) {
      return Response.json({ error: "No fal.ai API key — enter yours in the form" }, { status: 401 });
    }

    const { request_id, endpoint, concept, sidecar } = await req.json();
    if (!request_id || !endpoint) {
      return Response.json({ error: "request_id and endpoint are required" }, { status: 400 });
    }

    const status = await fal.queue.status(endpoint, { requestId: request_id });
    if (status.status !== "COMPLETED") {
      return Response.json({ status: status.status, queue_position: status.queue_position });
    }

    const result = await fal.queue.result(endpoint, { requestId: request_id });
    const video = result.data?.video;
    if (!video?.url) {
      return Response.json({ error: "No video returned" }, { status: 502 });
    }

    let saved = null;
    if (canSaveLocally) {
      saved = await saveToOutput({
        concept,
        baseName: `${timestamp()}_video_${request_id.slice(0, 8)}`,
        ext: "mp4",
        url: video.url,
        sidecar: { ...(sidecar || {}), endpoint, request_id, video_url: video.url },
      });
    }

    return Response.json({
      status: "COMPLETED",
      url: video.url,
      saved,
      expanded_prompt: result.data.expanded_prompt,
    });
  } catch (err) {
    // A 422 here means the job itself failed validation — surface the detail.
    return Response.json(
      { error: err?.body?.detail ? JSON.stringify(err.body.detail) : String(err) },
      { status: err?.status === 401 ? 401 : 500 }
    );
  }
}
