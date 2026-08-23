import { fal } from "@fal-ai/client";
import fs from "fs";
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const result = await fal.subscribe("fal-ai/nano-banana-2/edit", { input });
console.log(result.data?.images?.[0]?.url);
