import { z } from "zod";
import { createId } from "../shared/ids.js";
import type { ArtifactType, BlueprintStage, GenerationStageRun } from "../types/blueprint.js";
import { BlueprintRepository } from "../persistence/repository.js";

type StageRunnerInput<T> = {
  model: string;
  sessionId: string;
  stage: BlueprintStage;
  promptVersion: string;
  instructions: string;
  payload: unknown;
  schema: z.ZodType<T>;
  schemaName: string;
  execute: (context: {
    payload: unknown;
    stageRunId: string;
  }) => Promise<{ output: unknown; openaiResponseId?: string }>;
  artifactType: ArtifactType;
  inputArtifactIds: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function runBlueprintStage<T>(
  repository: BlueprintRepository,
  input: StageRunnerInput<T>
): Promise<{ output: T; stageRun: GenerationStageRun; artifactId: string }> {
  const stageRunId = createId("stage");
  repository.createStageRun({
    id: stageRunId,
    sessionId: input.sessionId,
    stage: input.stage,
    promptVersion: input.promptVersion,
    model: input.model,
    inputArtifactIds: input.inputArtifactIds,
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  try {
    const result = await input.execute({
      payload: input.payload,
      stageRunId
    });
    const parsed = input.schema.parse(result.output);
    const artifact = repository.saveArtifact(input.sessionId, input.artifactType, parsed);
    const updatedStageRun = repository.updateStageRun(stageRunId, {
      outputArtifactId: artifact.id,
      openaiResponseId: result.openaiResponseId,
      status: "completed"
    });

    return {
      output: parsed,
      stageRun: updatedStageRun,
      artifactId: artifact.id
    };
  } catch (error) {
    repository.updateStageRun(stageRunId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
