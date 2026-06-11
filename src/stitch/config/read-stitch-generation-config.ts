import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

const stitchGenerationConfigSchema = z.object({
  version: z.number().int().positive(),
  mode: z.enum(["single", "candidate"]).default("single"),
  candidateSearch: z.object({
    candidatesPerPage: z.number().int().positive(),
    maxRepromptAttempts: z.number().int().nonnegative(),
    maxCandidatesPerReprompt: z.number().int().positive()
  })
});

export type StitchGenerationConfig = z.infer<typeof stitchGenerationConfigSchema>;
export type StitchGenerationMode = StitchGenerationConfig["mode"];
export type StitchCandidateSearchConfig = StitchGenerationConfig["candidateSearch"];

let cachedConfig: StitchGenerationConfig | null = null;

function generationConfigFilePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "stitch-generation-config.yaml");
}

export function readStitchGenerationConfig(): StitchGenerationConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const raw = readFileSync(generationConfigFilePath(), "utf8");
  cachedConfig = stitchGenerationConfigSchema.parse(parse(raw));
  return cachedConfig;
}

export function resetStitchGenerationConfigCache(): void {
  cachedConfig = null;
}

export function isCandidateSearchEnabled(config: StitchGenerationConfig = readStitchGenerationConfig()): boolean {
  return config.mode === "candidate";
}
