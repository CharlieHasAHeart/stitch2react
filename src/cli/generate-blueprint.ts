import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import { generateBlueprintFromInput } from "../blueprint/pipeline/generate-blueprint.js";
import type { StageEvent } from "../blueprint/stages/stage-runner.js";
import { readOpenAIEnv } from "../blueprint/shared/env.js";

function formatCliError(error: unknown): string {
  if (error instanceof ZodError) {
    const envIssue = error.issues.find((issue) => issue.path[0] === "OPENAI_API_KEY");
    if (envIssue) {
      return "Missing OPENAI_API_KEY. Set OPENAI_BASE_URL, OPENAI_MODEL, and OPENAI_API_KEY in your .env before running blueprint generation.";
    }
    return `Environment configuration error: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
  }

  if (error instanceof Error) {
    if (error.message.includes("UnsupportedParamsError") || error.message.includes("temperature=0.2")) {
      return `Provider rejected the Responses API parameters: ${error.message}`;
    }
    return error.stack ?? error.message;
  }

  return String(error);
}

function clearPreviousArtifacts(): void {
  const artifactsRoot = resolve(process.cwd(), "artifacts");
  rmSync(artifactsRoot, { recursive: true, force: true });
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function logStageEvent(event: StageEvent): void {
  if (event.type === "start") {
    process.stderr.write(`[${event.sessionId}] ${event.stageRunId} START ${event.stage}
`);
    return;
  }

  if (event.type === "success") {
    process.stderr.write(
      `[${event.sessionId}] ${event.stageRunId} DONE ${event.stage} in ${formatDuration(event.durationMs)} -> ${event.outputArtifactId}
`
    );
    return;
  }

  process.stderr.write(
    `[${event.sessionId}] ${event.stageRunId} FAIL ${event.stage} in ${formatDuration(event.durationMs)}: ${event.error}
`
  );
}

async function main(): Promise<void> {
  readOpenAIEnv();

  const rawInput = process.argv.slice(2).join(" ").trim();
  if (!rawInput) {
    throw new Error('Usage: node dist/src/cli/generate-blueprint.js "your one-shot product input"');
  }

  clearPreviousArtifacts();

  const result = await generateBlueprintFromInput(rawInput, {
    onStageEvent: logStageEvent
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        sessionId: result.sessionId,
        blueprintId: result.blueprintId,
        validationReportId: result.validationReportId,
        blueprint: result.blueprint
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
