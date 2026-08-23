import { falFromRequest, canSaveLocally } from "../../../lib/fal";
import { saveToOutput, timestamp } from "../../../lib/save";

export const maxDuration = 300;

export async function POST(req) {
  try {
    const fal = falFromRequest(req);
    if (!fal) {
      return Response.json({ error: "No fal.ai API key — enter yours in the form" }, { status: 401 });
    }

    const { prompt, aspect_ratio, concept, role, reference_urls, logo_url } = await req.json();
    if (!prompt?.trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Collect reference images: previous frame(s) for character consistency,
    // plus the brand logo so the model reproduces the real mark instead of inventing one.
    const refs = [...(reference_urls || []), ...(logo_url ? [logo_url] : [])].filter(Boolean);

    let finalPrompt = prompt;
    if (logo_url) {
      finalPrompt +=
        "\n\nUse the exact logo from the provided logo reference image wherever the brand logo or app icon appears — do not invent or restyle the logo.";
    }

    const endpoint = refs.length ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";
    const input = {
      prompt: finalPrompt,
      aspect_ratio: aspect_ratio || "9:16",
      num_images: 1,
      output_format: "png",
    };
    if (refs.length) input.image_urls = refs;

    const result = await fal.subscribe(endpoint, { input });

    const image = result.data?.images?.[0];
    if (!image?.url) {
      return Response.json({ error: "No image returned" }, { status: 502 });
    }

    let saved = null;
    if (canSaveLocally) {
      saved = await saveToOutput({
        concept,
        baseName: `${timestamp()}_frame-${role || "start"}`,
        ext: "png",
        url: image.url,
        sidecar: { model: endpoint, prompt: finalPrompt, references: refs, aspect_ratio, image_url: image.url },
      });
    }

    return Response.json({ url: image.url, saved, description: result.data.description });
  } catch (err) {
    return Response.json(
      { error: err?.body?.detail ? JSON.stringify(err.body.detail) : String(err) },
      { status: err?.status === 401 ? 401 : 500 }
    );
  }
}
