import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export async function verifyPins(root = process.cwd()) {
  const errors = [];
  const documentation = await readFile(
    path.join(root, "docs/DEPENDENCIES.md"),
    "utf8",
  );
  for (const app of ["backend", "frontend"]) {
    const manifest = JSON.parse(
      await readFile(path.join(root, app, "package.json"), "utf8"),
    );
    const lock = JSON.parse(
      await readFile(path.join(root, app, "package-lock.json"), "utf8"),
    );
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (!EXACT.test(version))
          errors.push(`${app}: ${name} is not an exact version (${version}).`);
        if (!documentation.includes(`${name}@${version}`))
          errors.push(
            `${app}: ${name}@${version} is missing from docs/DEPENDENCIES.md.`,
          );
        const locked = lock.packages?.[""]?.[section]?.[name];
        if (locked !== version)
          errors.push(
            `${app}: lockfile root has ${name}=${locked ?? "(missing)"}, expected ${version}.`,
          );
        if (
          !lock.packages?.[`node_modules/${name}`] &&
          !Object.hasOwn(manifest.optionalDependencies ?? {}, name)
        ) {
          errors.push(
            `${app}: lockfile has no top-level package entry for ${name}.`,
          );
        }
      }
    }
    if (manifest.engines?.node !== ">=22.22.2")
      errors.push(`${app}: Node engine must be >=22.22.2.`);
    if (lock.lockfileVersion !== 3)
      errors.push(`${app}: lockfileVersion must be 3.`);
  }
  return errors;
}

const currentFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === fileURLToPath(import.meta.url)) {
  const errors = await verifyPins();
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      "Dependency pins match manifests, documentation, and lockfiles.\n",
    );
}
