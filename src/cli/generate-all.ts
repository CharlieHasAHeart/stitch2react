import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import {
  BlueprintRepository,
  FileBlueprintStore,
  generateBlueprintFromInput,
  generateValidatedStitchBundleFromFrozenBlueprint,
  GoogleStitchSdkStageClient
} from "../blueprint/index.js";
import type { StageEvent } from "../blueprint/stages/stage-runner.js";
import { readOpenAIEnv, readStitchEnv } from "../blueprint/shared/env.js";

function formatCliError(error: unknown): string {
  if (error instanceof ZodError) {
    return `Environment configuration error: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
  }

  if (error instanceof Error) {
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
    process.stderr.write(`[${event.sessionId}] ${event.stageRunId} START ${event.stage}\n`);
    return;
  }

  if (event.type === "success") {
    process.stderr.write(
      `[${event.sessionId}] ${event.stageRunId} DONE ${event.stage} in ${formatDuration(event.durationMs)} -> ${event.outputArtifactId}\n`
    );
    return;
  }

  process.stderr.write(
    `[${event.sessionId}] ${event.stageRunId} FAIL ${event.stage} in ${formatDuration(event.durationMs)}: ${event.error}\n`
  );
}

async function main(): Promise<void> {
  readOpenAIEnv();
  readStitchEnv();

  const rawInput = process.argv.slice(2).join(" ").trim();
  if (!rawInput) {
    throw new Error('Usage: node dist/src/cli/generate-all.js "your one-shot product input"');
  }

  clearPreviousArtifacts();

  const repository = new BlueprintRepository(new FileBlueprintStore());
  const blueprintResult = await generateBlueprintFromInput(rawInput, {
    repository,
    onStageEvent: logStageEvent
  });

  const stitchResult = await generateValidatedStitchBundleFromFrozenBlueprint(
    {
      sessionId: blueprintResult.sessionId,
      blueprintId: blueprintResult.blueprintId,
      frozenBlueprint: blueprintResult.blueprint
    },
    {
      repository,
      stageClient: new GoogleStitchSdkStageClient()
    }
  );

  process.stdout.write(
    `Full generation completed.\n` +
      `sessionId: ${blueprintResult.sessionId}\n` +
      `blueprintId: ${blueprintResult.blueprintId}\n` +
      `validationReportId: ${blueprintResult.validationReportId}\n` +
      `stitchPromptPlanArtifactId: ${stitchResult.promptPlanArtifactId}\n` +
      `pagesGenerated: ${stitchResult.pageResults.length}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
});
