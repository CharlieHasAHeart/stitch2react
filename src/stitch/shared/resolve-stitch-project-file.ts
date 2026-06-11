import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveStitchProjectFile(importMetaUrl: string, relativeToSrcRoot: string): string {
  const moduleDir = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    resolve(moduleDir, relativeToSrcRoot),
    resolve(moduleDir, "../../../../", relativeToSrcRoot),
    resolve(process.cwd(), relativeToSrcRoot)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}
