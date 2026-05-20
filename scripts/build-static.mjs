import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const dist = resolve("dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ["index.html", "styles.css", "assets", "js"]) {
  await cp(resolve(root, entry), resolve(dist, entry), { recursive: true });
}

console.log("Built Apex Pathway static site to dist/");
