import type { ProjectBundleManifest } from "../../blueprint/persistence/file-store.js";
import type { BlueprintRepository } from "../../blueprint/persistence/repository.js";
import type { StitchFinalValidationGateReport } from "../../blueprint/types/blueprint.js";
import type { GeneratedStitchHtmlArtifactsResult, ValidateRepairStitchHtmlArtifactsResult } from "./validate-repair-stitch-html-artifacts.js";

function projectRelativePath(...parts: string[]): string {
  return parts.join("/");
}

export function buildProjectBundleManifest(input: {
  repository: BlueprintRepository;
  projectId: string;
  sessionId: string;
  blueprintId: string;
  blueprintArtifactId: string;
  blueprintVersion: number;
  generation: GeneratedStitchHtmlArtifactsResult;
  validation: ValidateRepairStitchHtmlArtifactsResult;
}): ProjectBundleManifest {
  const { projectId, sessionId, blueprintId, blueprintArtifactId, blueprintVersion, generation, validation } = input;
  const finalManifestPages: ProjectBundleManifest["pages"] = validation.pageResults.map((page) => ({
    pageId: page.pageId,
    promptArtifactPath: page.promptArtifactPath,
    htmlArtifactPath: page.htmlArtifactPath,
    htmlFilePath: page.htmlFilePath,
    validationArtifactPath: page.validationArtifactPath,
    generationReportPath: page.generationReportPath,
    status: page.status
  }));

  return {
    projectId,
    sessionId,
    blueprintId,
    blueprintArtifactId,
    blueprintVersion,
    status: validation.finalGateReport.passed ? "stitch_completed" : "stitch_failed",
    finalValidationGateArtifactPath: projectRelativePath("stitch", "final-validation-gate.json"),
    blueprintJsonPath: generation.blueprintJsonPath,
    stitchPromptPlanPath: generation.stitchPromptPlanPath,
    pages: finalManifestPages,
    updatedAt: new Date().toISOString()
  };
}
