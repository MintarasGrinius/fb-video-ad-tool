import { createFalClient } from "@fal-ai/client";

// Per-request fal client: the user's key from the x-fal-key header wins,
// falling back to the server's FAL_KEY env (local dev). Keys are never persisted.
export function falFromRequest(req) {
  const key = req.headers.get("x-fal-key")?.trim() || process.env.FAL_KEY;
  if (!key) return null;
  return createFalClient({ credentials: key });
}

// Local file saving is unavailable on Vercel's read-only filesystem.
export const canSaveLocally = !process.env.VERCEL;
