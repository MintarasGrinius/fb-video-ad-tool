import { fal } from "@fal-ai/client";
import fs from "fs";

const requestId = fs.readFileSync(process.argv[2], "utf8").trim();
const endpoint = "minimax/h3/image-to-video/lora";

const status = await fal.queue.status(endpoint, { requestId });
console.log("status:", status.status, status.queue_position ?? "");

if (status.status === "COMPLETED") {
  const result = await fal.queue.result(endpoint, { requestId });
  fs.writeFileSync(process.argv[3], JSON.stringify(result.data, null, 2));
  console.log("video_url:", result.data?.video?.url);
}
