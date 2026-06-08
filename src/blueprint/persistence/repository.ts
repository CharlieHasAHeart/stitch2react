import { checksumJson } from "../shared/hash.js";
import { createId } from "../shared/ids.js";
import type {
  ArtifactType,
  BlueprintQualityReport,
  BlueprintVersion,
  BlueprintVersionStatus,
  GateReport,
  GenerationArtifact,
  GenerationSession,
  GenerationStageRun,
  RepairGuardReport,
  RepairPlan,
  SessionStatus,
  ValidationReport
} from "../types/blueprint.js";
import { FileBlueprintStore } from "./file-store.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class BlueprintRepository {
  constructor(private readonly store: FileBlueprintStore) {}

  createSession(rawInputArtifactId = ""): GenerationSession {
    const session: GenerationSession = {
      id: createId("sess"),
      status: "created",
      rawInputArtifactId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.saveSession(session);
    return session;
  }

  updateSession(sessionId: string, patch: Partial<GenerationSession>): GenerationSession {
    const existing = this.requireSession(sessionId);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };
    this.store.saveSession(updated);
    return updated;
  }

  saveArtifact(
    sessionId: string,
    artifactType: ArtifactType,
    json: unknown,
    checksum?: string
  ): GenerationArtifact {
    const artifact: GenerationArtifact = {
      id: createId("art"),
      sessionId,
      artifactType,
      version: this.store.artifactVersion(sessionId, artifactType),
      json,
      checksum: checksum ?? checksumJson(json),
      createdAt: nowIso()
    };
    this.store.saveArtifactRecord(artifact);
    return artifact;
  }

  createStageRun(stageRun: GenerationStageRun): GenerationStageRun {
    this.store.saveStageRun(stageRun);
    return stageRun;
  }

  updateStageRun(stageRunId: string, patch: Partial<GenerationStageRun>): GenerationStageRun {
    const existing = this.requireStageRun(stageRunId);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };
    this.store.saveStageRun(updated);
    return updated;
  }

  createBlueprintVersion(
    sessionId: string,
    artifactId: string,
    status: BlueprintVersionStatus
  ): BlueprintVersion {
    const version: BlueprintVersion = {
      id: createId("bp"),
      sessionId,
      version: this.store.blueprintVersion(sessionId),
      status,
      artifactId,
      createdAt: nowIso()
    };
    this.store.saveBlueprintVersion(version);
    return version;
  }

  updateBlueprintVersion(blueprintId: string, patch: Partial<BlueprintVersion>): BlueprintVersion {
    const existing = this.requireBlueprintVersion(blueprintId);
    const updated = { ...existing, ...patch };
    this.store.saveBlueprintVersion(updated);
    return updated;
  }

  supersedeNonFrozenBlueprints(sessionId: string, exceptBlueprintId: string): void {
    for (const version of Object.values(this.store.collections.blueprintVersions)) {
      if (
        version.sessionId === sessionId &&
        version.id !== exceptBlueprintId &&
        version.status !== "frozen"
      ) {
        this.store.saveBlueprintVersion({
          ...version,
          status: "superseded"
        });
      }
    }
  }

  saveValidationReport(report: ValidationReport): ValidationReport {
    this.store.saveValidationReport(report);
    return report;
  }

  saveQualityReviewReport(report: BlueprintQualityReport): BlueprintQualityReport {
    this.store.saveQualityReviewReport(report);
    return report;
  }

  saveGateReport(report: GateReport): GateReport {
    this.store.saveGateReport(report);
    return report;
  }

  saveRepairPlan(plan: RepairPlan): RepairPlan {
    this.store.saveRepairPlan(plan);
    return plan;
  }

  saveRepairGuardReport(report: RepairGuardReport): RepairGuardReport {
    this.store.saveRepairGuardReport(report);
    return report;
  }

  requireSession(sessionId: string): GenerationSession {
    const session = this.store.collections.sessions[sessionId];
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  requireStageRun(stageRunId: string): GenerationStageRun {
    const stageRun = this.store.collections.stageRuns[stageRunId];
    if (!stageRun) {
      throw new Error(`Unknown stage run: ${stageRunId}`);
    }
    return stageRun;
  }

  requireArtifact(artifactId: string): GenerationArtifact {
    const artifact = this.store.collections.artifacts[artifactId];
    if (!artifact) {
      throw new Error(`Unknown artifact: ${artifactId}`);
    }
    return artifact;
  }

  requireBlueprintVersion(blueprintId: string): BlueprintVersion {
    const version = this.store.collections.blueprintVersions[blueprintId];
    if (!version) {
      throw new Error(`Unknown blueprint version: ${blueprintId}`);
    }
    return version;
  }

  listStageRuns(sessionId: string): GenerationStageRun[] {
    return Object.values(this.store.collections.stageRuns).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listArtifacts(sessionId: string): GenerationArtifact[] {
    return Object.values(this.store.collections.artifacts).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listSessions(): GenerationSession[] {
    return Object.values(this.store.collections.sessions);
  }

  listGateReports(sessionId: string): GateReport[] {
    return Object.values(this.store.collections.gateReports).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listRepairPlans(sessionId: string): RepairPlan[] {
    return Object.values(this.store.collections.repairPlans).filter(
      (item) => item.sessionId === sessionId
    );
  }

  listRepairGuardReports(sessionId: string): RepairGuardReport[] {
    return Object.values(this.store.collections.repairGuardReports).filter(
      (item) => item.sessionId === sessionId
    );
  }

  setSessionStatus(sessionId: string, status: SessionStatus): GenerationSession {
    return this.updateSession(sessionId, { status });
  }
}
