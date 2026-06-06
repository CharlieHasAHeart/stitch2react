import type {
  BlueprintVersion,
  GenerationArtifact,
  GenerationSession,
  GenerationStageRun,
  ValidationReport
} from "../types/blueprint.js";

export class InMemoryBlueprintStore {
  sessions = new Map<string, GenerationSession>();
  stageRuns = new Map<string, GenerationStageRun>();
  artifacts = new Map<string, GenerationArtifact>();
  blueprintVersions = new Map<string, BlueprintVersion>();
  validationReports = new Map<string, ValidationReport>();

  artifactVersion(sessionId: string, artifactType: GenerationArtifact["artifactType"]): number {
    let count = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.sessionId === sessionId && artifact.artifactType === artifactType) {
        count += 1;
      }
    }
    return count + 1;
  }

  blueprintVersion(sessionId: string): number {
    let count = 0;
    for (const version of this.blueprintVersions.values()) {
      if (version.sessionId === sessionId) {
        count += 1;
      }
    }
    return count + 1;
  }
}
