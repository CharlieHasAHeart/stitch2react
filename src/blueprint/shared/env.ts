import "dotenv/config";
import { z } from "zod";

const openAiEnvSchema = z.object({
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1)
});

export type OpenAIEnv = z.infer<typeof openAiEnvSchema>;

export function readOpenAIEnv(env: NodeJS.ProcessEnv = process.env): OpenAIEnv {
  return openAiEnvSchema.parse(env);
}
