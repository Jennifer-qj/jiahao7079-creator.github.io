import fs from "node:fs/promises";

await fs.rm("dist", { recursive: true, force: true });
await fs.cp("out", "dist", { recursive: true });
console.log("Static site copied to dist/");
