import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");
const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

mkdirSync(dest, { recursive: true });
for (const file of files) {
  const from = join(src, file);
  if (!existsSync(from)) continue;
  const to = join(dest, file);
  if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) continue;
  copyFileSync(from, to);
  console.log(`[mediapipe] ${file}`);
}
