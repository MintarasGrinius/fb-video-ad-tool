import { fal } from "@fal-ai/client";
import fs from "fs";

const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { request_id } = await fal.queue.submit("minimax/h3/image-to-video/lora", { input });
fs.writeFileSync(process.argv[3], request_id);
console.log("submitted:", request_id);
