import fs from "node:fs/promises";

await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist/server", { recursive: true });
await fs.mkdir("dist/.openai", { recursive: true });
await fs.cp("out", "dist/client", { recursive: true });
await fs.copyFile("server/static-worker.mjs", "dist/server/index.js");
await fs.copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Static client, Worker entrypoint, and hosting metadata copied to dist/");
