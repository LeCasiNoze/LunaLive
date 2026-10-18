import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
const api = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  output = join(api, ".runtime", "observatory-bundle");
const lock = JSON.parse(await readFile(join(api, "package-lock.json"), "utf8")),
  zod = lock.packages["node_modules/zod"];
const pkg = {
  name: "rumble-observatory-worker",
  version: "1.0.0",
  private: true,
  type: "module",
  engines: { node: ">=22.16.0" },
  dependencies: { zod: zod.version },
};
await mkdir(join(output, "api", "dist", "observatory"), { recursive: true });
await mkdir(join(output, "api", "scripts", "observatory"), { recursive: true });
await writeFile(
  join(output, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n",
);
await writeFile(
  join(output, "package-lock.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      lockfileVersion: 3,
      requires: true,
      packages: { "": pkg, "node_modules/zod": zod },
    },
    null,
    2,
  ) + "\n",
);
const files = [];
for (const file of ["category.js", "core.js", "schema.js", "sse.js"]) {
  const relative = "api/dist/observatory/" + file;
  await copyFile(
    join(api, "dist", "observatory", file),
    join(output, relative),
  );
  files.push(relative);
}
for (const file of [
  "collector.mjs",
  "dashboard-metrics.mjs",
  "probe.mjs",
  "annotate-mode.mjs",
  "smoke-live.mjs",
  "rumble-observatory.service",
  "config.example.json",
]) {
  const relative = "api/scripts/observatory/" + file;
  await copyFile(
    join(api, "scripts", "observatory", file),
    join(output, relative),
  );
  files.push(relative);
}
const hashes = {};
for (const f of ["package.json", "package-lock.json", ...files])
  hashes[f] = createHash("sha256")
    .update(await readFile(join(output, f)))
    .digest("hex");
await writeFile(
  join(output, "SHA256.json"),
  JSON.stringify(hashes, null, 2) + "\n",
);
console.log(output);
