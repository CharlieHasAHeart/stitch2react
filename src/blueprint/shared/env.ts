import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { z } from "zod";

const openAiEnvSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1)
});

const stitchEnvSchema = z.object({
  STITCH_API_KEY: z.string().min(1).optional(),
  STITCH_ACCESS_TOKEN: z.string().min(1).optional(),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  STITCH_HOST: z.string().url().optional()
}).superRefine((value, ctx) => {
  const hasApiKey = Boolean(value.STITCH_API_KEY);
  const hasOAuth = Boolean(value.STITCH_ACCESS_TOKEN && value.GOOGLE_CLOUD_PROJECT);

  if (!hasApiKey && !hasOAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either STITCH_API_KEY, or STITCH_ACCESS_TOKEN together with GOOGLE_CLOUD_PROJECT.",
      path: ["STITCH_API_KEY"]
    });
  }
});

export type OpenAIEnv = z.infer<typeof openAiEnvSchema>;
export type StitchEnv = z.infer<typeof stitchEnvSchema>;

const managedEnvKeys = [
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_API_KEY",
  "STITCH_API_KEY",
  "STITCH_ACCESS_TOKEN",
  "GOOGLE_CLOUD_PROJECT",
  "STITCH_HOST"
] as const;

let cachedProjectEnv: NodeJS.ProcessEnv | null = null;

function loadProjectEnv(): NodeJS.ProcessEnv {
  if (cachedProjectEnv) {
    return cachedProjectEnv;
  }

  const envPath = resolve(process.cwd(), ".env");
  const nextEnv: NodeJS.ProcessEnv = { ...process.env };

  for (const key of managedEnvKeys) {
    delete nextEnv[key];
    delete process.env[key];
  }

  if (existsSync(envPath)) {
    const parsedEnv = parseDotenv(readFileSync(envPath));
    for (const key of managedEnvKeys) {
      const value = parsedEnv[key];
      if (value === undefined) {
        continue;
      }
      nextEnv[key] = value;
    }
  }

  for (const key of managedEnvKeys) {
    if (nextEnv[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = nextEnv[key];
  }

  cachedProjectEnv = nextEnv;
  return nextEnv;
}

export function resetProjectEnv(): void {
  cachedProjectEnv = null;
}

export function readOpenAIEnv(): OpenAIEnv {
  return openAiEnvSchema.parse(loadProjectEnv());
}

export function readStitchEnv(): StitchEnv {
  return stitchEnvSchema.parse(loadProjectEnv());
}
