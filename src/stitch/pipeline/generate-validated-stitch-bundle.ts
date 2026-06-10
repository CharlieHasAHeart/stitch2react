import type { StitchGenerationInput, StitchPipelineResult } from "../../blueprint/types/blueprint.js";
import { ChromeCdpRuntimeValidationClient } from "../runtime/validate-stitch-runtime.js";
import { buildProjectBundleManifest } from "./build-project-bundle-manifest.js";
import { generateStitchHtmlArtifacts, type GenerateStitchHtmlArtifactsOptions } from "./generate-stitch-html-artifacts.js";
import { validateRepairStitchHtmlArtifacts, type ValidateRepairStitchHtmlArtifactsOptions } from "./validate-repair-stitch-html-artifacts.js";

export type GenerateValidatedStitchBundleOptions = GenerateStitchHtmlArtifactsOptions & {
  runtimeValidationClient?: ValidateRepairStitchHtmlArtifactsOptions["runtimeValidationClient"];
};

export async function generateValidatedStitchBundleFromFrozenBlueprint(
  input: StitchGenerationInput,
  options: GenerateValidatedStitchBundleOptions
): Promise<StitchPipelineResult> {
  const runtimeValidationClient = options.runtimeValidationClient ?? new ChromeCdpRuntimeValidationClient();
  const generation = await generateStitchHtmlArtifacts(input, {
    repository: options.repository,
    stageClient: options.stageClient
  });
  const validation = await validateRepairStitchHtmlArtifacts(
    { ...input, generated: generation },
    {
      repository: options.repository,
      runtimeValidationClient
    }
  );

  const blueprintVersion = options.repository.requireBlueprintVersion(input.blueprintId);
  options.repository.setSessionStatus(input.sessionId, "stitch_completed");
  options.repository.saveProjectBundleManifest(input.blueprintId, buildProjectBundleManifest({
    repository: options.repository,
    projectId: input.blueprintId,
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    blueprintArtifactId: blueprintVersion.artifactId,
    blueprintVersion: blueprintVersion.version,
    generation,
    validation
  }));

  return {
    sessionId: input.sessionId,
    blueprintId: input.blueprintId,
    promptPlanArtifactId: generation.promptPlanArtifactId,
    pageResults: validation.pageResults,
    crossPageValidationReportId: validation.crossPageValidationReportId,
    validatedArtifactGateReportId: validation.validatedArtifactGateReportId
  };
}
